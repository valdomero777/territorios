import {
  collection, doc, getDoc, getDocs, onSnapshot, setDoc, writeBatch,
} from "firebase/firestore";
import type { DocumentData, Unsubscribe, WriteBatch } from "firebase/firestore";
import { db } from "./firebase";
import type { Repo } from "./repo";
import { RepoLocal } from "./repoLocal";
import type {
  AsignacionTerritorio, BaseDatos, CasaMarcada, Ciclo, Config, EventoEspecial, Jornada,
  LatLng, Persona, PuntoReunion, Registro, Territorio,
} from "../domain/tipos";

/**
 * Registro compartido en vivo (Firestore). Varias colecciones en vez de un
 * solo documento gigante: Firestore limita cada documento a 1 MB y la
 * bitácora crece sin fin, así que lo que crece va aparte, con un documento
 * por renglón — así dos personas guardando casi al mismo tiempo no se pisan
 * (cada una toca documentos distintos) y nunca se reescribe todo por un solo
 * cambio chico.
 *
 * `cargar()`/`suscribir()` regresan un `BaseDatos` "crudo" (la geometría de
 * los territorios llega vacía a propósito): quien llama —`useApp.tsx`, igual
 * que con `RepoLocal`— le aplica `migrar()`, que ya sabe rellenar la
 * geometría real desde el mapa base y aplicar `geometriaEditada`. No hace
 * falta duplicar esa lógica aquí.
 */
const TAMANIO_LOTE = 450; // margen bajo el límite de 500 operaciones por writeBatch de Firestore

// Todo cuelga de un solo documento ancla `congregacion/estado` (2 segmentos,
// como pide Firestore para un documento). Las colecciones que crecen son
// SUBcolecciones de ese documento — `congregacion/estado/registros/{id}` (4
// segmentos) — no colecciones hermanas sueltas: Firestore exige que las
// referencias a colección tengan un número IMPAR de segmentos, así que
// `congregacion/registros` (2 segmentos) directamente no es válido.
const docEstado = () => doc(db!, "congregacion", "estado");
const colEn = (nombre: string) => collection(db!, "congregacion", "estado", nombre);
const docEn = (nombre: string, id: string) => doc(db!, "congregacion", "estado", nombre, id);

type CuadraOverlay = Pick<Territorio["cuadras"][number], "id" | "letra" | "activa"> & { notas?: string };
type TerritorioOverlay = Pick<Territorio, "id" | "nombre" | "zona" | "color" | "activo"> & {
  notas?: string;
  ultimaVezCompletado?: string;
  cuadras: CuadraOverlay[];
};

interface Estado {
  version: number;
  config: Config;
  ciclos: Ciclo[];
  eventos: EventoEspecial[];
  puntosReunion: PuntoReunion[];
  casasMarcadas: CasaMarcada[];
  territorios: TerritorioOverlay[];
}

function overlayDeTerritorios(territorios: Territorio[]): TerritorioOverlay[] {
  return territorios.map((t) => ({
    id: t.id,
    nombre: t.nombre,
    zona: t.zona,
    color: t.color,
    activo: t.activo,
    notas: t.notas,
    ultimaVezCompletado: t.ultimaVezCompletado,
    cuadras: t.cuadras.map((c) => ({ id: c.id, letra: c.letra, activa: c.activa, notas: c.notas })),
  }));
}

function ensamblar(
  estado: Estado,
  personas: Persona[],
  registros: Registro[],
  asignaciones: AsignacionTerritorio[],
  jornadas: Jornada[],
  geometriaEditada: Record<string, LatLng[]>,
): BaseDatos {
  return {
    version: estado.version,
    config: estado.config,
    ciclos: estado.ciclos,
    eventos: estado.eventos,
    puntosReunion: estado.puntosReunion,
    casasMarcadas: estado.casasMarcadas,
    // La geometría (etiqueta, cuadras completas) la rellena `migrar()` desde
    // el mapa base; aquí solo va el overlay editable. `migrar()` tolera esta
    // forma parcial — es la misma que ya usa para adaptar datos viejos.
    territorios: estado.territorios as unknown as Territorio[],
    personas,
    registros,
    asignaciones,
    jornadas,
    geometriaEditada,
  };
}

/** Compara por id y contenido; agrega al lote solo lo que de verdad cambió. */
function sincronizarColeccion<T extends { id: string }>(
  operaciones: (() => void)[],
  lote: () => WriteBatch,
  nombreColeccion: string,
  actuales: T[],
  cache: Map<string, T>,
) {
  const vistos = new Set<string>();
  for (const item of actuales) {
    vistos.add(item.id);
    const previo = cache.get(item.id);
    if (previo && JSON.stringify(previo) === JSON.stringify(item)) continue;
    operaciones.push(() => {
      if (!db) return;
      lote().set(docEn(nombreColeccion, item.id), item as DocumentData);
    });
    cache.set(item.id, item);
  }
  for (const id of cache.keys()) {
    if (vistos.has(id)) continue;
    operaciones.push(() => {
      if (!db) return;
      lote().delete(docEn(nombreColeccion, id));
    });
    cache.delete(id);
  }
}

export class RepoFirebase implements Repo {
  readonly nombre = "Compartido (Firebase)";

  // Última copia conocida de cada fuente: referencia (atajo rápido) + caché
  // por id (para diferenciar qué cambió cuando la referencia sí cambió).
  private refPersonas: Persona[] | null = null;
  private refRegistros: Registro[] | null = null;
  private refAsignaciones: AsignacionTerritorio[] | null = null;
  private refJornadas: Jornada[] | null = null;
  private refTerritorios: Territorio[] | null = null;
  private refGeometria: Record<string, LatLng[]> | null = null;
  private refConfig: Config | null = null;
  private refCiclos: Ciclo[] | null = null;
  private refEventos: EventoEspecial[] | null = null;
  private refPuntosReunion: PuntoReunion[] | null = null;
  private refCasasMarcadas: CasaMarcada[] | null = null;

  private cachePersonas = new Map<string, Persona>();
  private cacheRegistros = new Map<string, Registro>();
  private cacheAsignaciones = new Map<string, AsignacionTerritorio>();
  private cacheJornadas = new Map<string, Jornada>();
  private cacheGeometria = new Map<string, { id: string; anillo: LatLng[] }>();
  private ultimoEstadoTexto: string | null = null;

  // Plan B: si la nube falla (cuota agotada, sin señal con el servidor…),
  // no hay razón para que el capitán pierda lo que acaba de registrar en la
  // calle. Todo cambio se guarda también aquí, y si `guardar()` a Firestore
  // truena, esta copia queda como la única fuente de verdad hasta que la
  // nube se recupere (entonces el próximo `guardar()` que sí funcione la
  // vuelve a poner al día).
  private respaldo = new RepoLocal();
  private fallando = false;
  private oyentesEstado = new Set<(fallando: boolean) => void>();

  private avisarEstado(fallando: boolean) {
    if (this.fallando === fallando) return;
    this.fallando = fallando;
    for (const cb of this.oyentesEstado) cb(fallando);
  }

  estadoNube(cb: (fallando: boolean) => void): () => void {
    this.oyentesEstado.add(cb);
    cb(this.fallando);
    return () => this.oyentesEstado.delete(cb);
  }

  async cargar(): Promise<BaseDatos | null> {
    try {
      const resultado = await this.cargarDeFirestore();
      this.avisarEstado(false);
      return resultado;
    } catch (e) {
      console.error("No se pudo cargar de Firebase; se usa el respaldo local.", e);
      this.avisarEstado(true);
      return this.respaldo.cargar();
    }
  }

  private async cargarDeFirestore(): Promise<BaseDatos | null> {
    if (!db) return null;
    const estadoSnap = await getDoc(docEstado());
    if (!estadoSnap.exists()) return null;
    const [personas, registros, asignaciones, jornadas, geometria] = await Promise.all([
      getDocs(colEn("personas")),
      getDocs(colEn("registros")),
      getDocs(colEn("asignaciones")),
      getDocs(colEn("jornadas")),
      getDocs(colEn("geometria")),
    ]);
    const estado = estadoSnap.data() as Estado;
    const geometriaEditada = Object.fromEntries(
      geometria.docs.map((d) => [d.id, (d.data() as { anillo: LatLng[] }).anillo]),
    );
    this.actualizarCache(
      estado,
      personas.docs.map((d) => d.data() as Persona),
      registros.docs.map((d) => d.data() as Registro),
      asignaciones.docs.map((d) => d.data() as AsignacionTerritorio),
      jornadas.docs.map((d) => d.data() as Jornada),
      geometriaEditada,
    );
    return ensamblar(
      estado,
      [...this.cachePersonas.values()],
      [...this.cacheRegistros.values()],
      [...this.cacheAsignaciones.values()],
      [...this.cacheJornadas.values()],
      geometriaEditada,
    );
  }

  private actualizarCache(
    estado: Estado,
    personas: Persona[],
    registros: Registro[],
    asignaciones: AsignacionTerritorio[],
    jornadas: Jornada[],
    geometriaEditada: Record<string, LatLng[]>,
  ) {
    this.cachePersonas = new Map(personas.map((p) => [p.id, p]));
    this.cacheRegistros = new Map(registros.map((r) => [r.id, r]));
    this.cacheAsignaciones = new Map(asignaciones.map((a) => [a.id, a]));
    this.cacheJornadas = new Map(jornadas.map((j) => [j.id, j]));
    this.cacheGeometria = new Map(
      Object.entries(geometriaEditada).map(([id, anillo]) => [id, { id, anillo }]),
    );
    this.ultimoEstadoTexto = JSON.stringify(estado);
  }

  async guardar(base: BaseDatos): Promise<void> {
    if (!db) return;
    // Respaldo local primero: si todo lo de abajo falla, ya quedó a salvo.
    void this.respaldo.guardar(base);

    // Instantánea de refs y cachés: `sincronizarColeccion` los va actualizando
    // como si el envío ya hubiera funcionado (para no recalcular el diff dos
    // veces). Si el envío de verdad falla, se restauran, así el próximo
    // intento vuelve a incluir exactamente lo que no se guardó.
    const snapshot = {
      refPersonas: this.refPersonas, refRegistros: this.refRegistros,
      refAsignaciones: this.refAsignaciones, refJornadas: this.refJornadas,
      refTerritorios: this.refTerritorios, refGeometria: this.refGeometria,
      refConfig: this.refConfig, refCiclos: this.refCiclos,
      refEventos: this.refEventos, refPuntosReunion: this.refPuntosReunion,
      refCasasMarcadas: this.refCasasMarcadas,
      ultimoEstadoTexto: this.ultimoEstadoTexto,
      cachePersonas: new Map(this.cachePersonas),
      cacheRegistros: new Map(this.cacheRegistros),
      cacheAsignaciones: new Map(this.cacheAsignaciones),
      cacheJornadas: new Map(this.cacheJornadas),
      cacheGeometria: new Map(this.cacheGeometria),
    };
    try {
      await this.guardarEnFirestore(base);
      this.avisarEstado(false);
    } catch (e) {
      console.error("No se pudo guardar en Firebase; queda solo el respaldo local por ahora.", e);
      Object.assign(this, snapshot);
      this.avisarEstado(true);
    }
  }

  private async guardarEnFirestore(base: BaseDatos): Promise<void> {
    if (!db) return;
    const operaciones: (() => void)[] = [];
    const lotes: WriteBatch[] = [];
    let actual: WriteBatch | null = null;
    let enLote = 0;
    const lote = (): WriteBatch => {
      if (!actual || enLote >= TAMANIO_LOTE) {
        actual = writeBatch(db!);
        lotes.push(actual);
        enLote = 0;
      }
      enLote += 1;
      return actual;
    };

    if (base.personas !== this.refPersonas) {
      sincronizarColeccion(operaciones, lote, "personas", base.personas, this.cachePersonas);
      this.refPersonas = base.personas;
    }
    if (base.registros !== this.refRegistros) {
      sincronizarColeccion(operaciones, lote, "registros", base.registros, this.cacheRegistros);
      this.refRegistros = base.registros;
    }
    if (base.asignaciones !== this.refAsignaciones) {
      sincronizarColeccion(operaciones, lote, "asignaciones", base.asignaciones, this.cacheAsignaciones);
      this.refAsignaciones = base.asignaciones;
    }
    if (base.jornadas !== this.refJornadas) {
      sincronizarColeccion(operaciones, lote, "jornadas", base.jornadas, this.cacheJornadas);
      this.refJornadas = base.jornadas;
    }
    if (base.geometriaEditada !== this.refGeometria) {
      const comoLista = Object.entries(base.geometriaEditada).map(([id, anillo]) => ({ id, anillo }));
      sincronizarColeccion(operaciones, lote, "geometria", comoLista, this.cacheGeometria);
      this.refGeometria = base.geometriaEditada;
    }

    const tocaEstado =
      base.config !== this.refConfig ||
      base.ciclos !== this.refCiclos ||
      base.eventos !== this.refEventos ||
      base.puntosReunion !== this.refPuntosReunion ||
      base.casasMarcadas !== this.refCasasMarcadas ||
      base.territorios !== this.refTerritorios;
    if (tocaEstado) {
      const estado: Estado = {
        version: base.version,
        config: base.config,
        ciclos: base.ciclos,
        eventos: base.eventos,
        puntosReunion: base.puntosReunion,
        casasMarcadas: base.casasMarcadas,
        territorios: overlayDeTerritorios(base.territorios),
      };
      const texto = JSON.stringify(estado);
      let escribirEstado: Promise<void> | null = null;
      if (texto !== this.ultimoEstadoTexto) {
        escribirEstado = setDoc(docEstado(), estado);
        this.ultimoEstadoTexto = texto;
      }
      this.refConfig = base.config;
      this.refCiclos = base.ciclos;
      this.refEventos = base.eventos;
      this.refPuntosReunion = base.puntosReunion;
      this.refCasasMarcadas = base.casasMarcadas;
      this.refTerritorios = base.territorios;

      for (const op of operaciones) op();
      await Promise.all([...lotes.map((l) => l.commit()), escribirEstado].filter(Boolean));
      return;
    }

    if (!operaciones.length) return;
    for (const op of operaciones) op();
    await Promise.all(lotes.map((l) => l.commit()));
  }

  suscribir(cb: (base: BaseDatos) => void): () => void {
    if (!db) return () => {};

    const listos = { estado: false, personas: false, registros: false, asignaciones: false, jornadas: false, geometria: false };
    let estado: Estado | null = null;
    let personas: Persona[] = [];
    let registros: Registro[] = [];
    let asignaciones: AsignacionTerritorio[] = [];
    let jornadas: Jornada[] = [];
    let geometriaEditada: Record<string, LatLng[]> = {};

    const emitir = () => {
      if (!estado || !Object.values(listos).every(Boolean)) return;
      this.actualizarCache(estado, personas, registros, asignaciones, jornadas, geometriaEditada);
      this.avisarEstado(false);
      cb(ensamblar(estado, personas, registros, asignaciones, jornadas, geometriaEditada));
    };
    // Si un listener truena (misma cuota agotada, por ejemplo), al menos que
    // se sepa: no queda forma de reintentarlo solo, pero sí de avisar.
    const alFallar = (e: unknown) => {
      console.error("Un listener de Firebase falló; los cambios en vivo de otros dispositivos dejan de llegar.", e);
      this.avisarEstado(true);
    };

    const suscripciones: Unsubscribe[] = [
      onSnapshot(docEstado(), (snap) => {
        if (snap.exists()) estado = snap.data() as Estado;
        listos.estado = true;
        emitir();
      }, alFallar),
      onSnapshot(colEn("personas"), (snap) => {
        personas = snap.docs.map((d) => d.data() as Persona);
        listos.personas = true;
        emitir();
      }, alFallar),
      onSnapshot(colEn("registros"), (snap) => {
        registros = snap.docs.map((d) => d.data() as Registro);
        listos.registros = true;
        emitir();
      }, alFallar),
      onSnapshot(colEn("asignaciones"), (snap) => {
        asignaciones = snap.docs.map((d) => d.data() as AsignacionTerritorio);
        listos.asignaciones = true;
        emitir();
      }, alFallar),
      onSnapshot(colEn("jornadas"), (snap) => {
        jornadas = snap.docs.map((d) => d.data() as Jornada);
        listos.jornadas = true;
        emitir();
      }, alFallar),
      onSnapshot(colEn("geometria"), (snap) => {
        geometriaEditada = Object.fromEntries(
          snap.docs.map((d) => [d.id, (d.data() as { anillo: LatLng[] }).anillo]),
        );
        listos.geometria = true;
        emitir();
      }, alFallar),
    ];

    return () => suscripciones.forEach((u) => u());
  }
}
