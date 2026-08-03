import { areaYCentroide, mapaBase } from "./mapa";
import { hoy } from "./fechas";
import { MODALIDADES_POR_DEFECTO } from "./tipos";
import type { BaseDatos, Config, Cuadra, Jornada, LatLng, Persona, Territorio } from "./tipos";

export const VERSION_BD = 1;

export const NOTA_ROL_POR_DEFECTO =
  "Los encargados se comprometen a estar temprano y cumplir con su privilegio (Mateo 5:37); " +
  "de no poder, deberán avisar. La reunión deberá durar de 5 a 7 minutos máximo, con todo y la " +
  "organización de parejas (Ods, cap. 7, párrs. 20-21).";

export const CONFIG_POR_DEFECTO: Config = {
  nombreCongregacion: mapaBase.meta.congregacion,
  modalidades: MODALIDADES_POR_DEFECTO.map((m) => ({ ...m })),
  notaRol: NOTA_ROL_POR_DEFECTO,
  politicaCiclo: "libre",
  diasAlertaRepeticion: 30,
  umbralReciente: 30,
  umbralMedio: 90,
  metaCuadrasSemana: 12,
};

let contador = 0;
/** Identificador local, ordenable por creación y sin colisiones prácticas. */
export function nuevoId(prefijo = "id"): string {
  contador += 1;
  return `${prefijo}_${Date.now().toString(36)}${contador.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

/** Territorios editables, sembrados desde la geometría del mapa. */
export function territoriosIniciales(): Territorio[] {
  return mapaBase.territorios.map((t) => ({
    id: t.id,
    nombre: t.nombre,
    zona: t.zona,
    color: t.color,
    etiqueta: t.etiqueta,
    etiquetaLatLng: t.etiquetaLatLng,
    activo: true,
    cuadras: t.cuadras.map((c) => ({
      id: c.id,
      origen: c.id,
      letra: c.letra,
      d: c.d,
      centro: c.centro,
      latlng: c.latlng,
      centroLatLng: c.centroLatLng,
      areaM2: c.areaM2,
      areaU: c.areaU,
      activa: true,
    })),
  }));
}

export function baseInicial(): BaseDatos {
  const inicio = hoy();
  return {
    version: VERSION_BD,
    config: { ...CONFIG_POR_DEFECTO },
    territorios: territoriosIniciales(),
    personas: [],
    puntosReunion: [],
    jornadas: [],
    registros: [],
    asignaciones: [],
    eventos: [],
    ciclos: [{ id: nuevoId("ciclo"), nombre: "Ciclo 1", inicio, fin: null }],
    geometriaEditada: {},
  };
}

/**
 * Aplica el borrador de forma corregida a mano (`geometriaEditada`) sobre las
 * cuadras que correspondan. Gana sobre la geometría del mapa base: se llama
 * después de refrescarla, tanto al migrar como al guardar una edición nueva.
 */
export function aplicarGeometriaEditada(
  territorios: Territorio[],
  geometriaEditada: Record<string, LatLng[]>,
): Territorio[] {
  if (!Object.keys(geometriaEditada).length) return territorios;
  return territorios.map((t) => {
    let cambio = false;
    const cuadras = t.cuadras.map((c) => {
      const anillo = geometriaEditada[c.id];
      if (!anillo) return c;
      cambio = true;
      const { areaM2, centro: centroLatLng } = areaYCentroide(anillo);
      return { ...c, latlng: anillo, centroLatLng, areaM2 };
    });
    return cambio ? { ...t, cuadras } : t;
  });
}

/**
 * Adapta datos guardados por una versión anterior de la app.
 *
 * Lo importante aquí es la geometría: los territorios guardados conservan lo que
 * el usuario editó (nombre, zona, color, bajas, notas y las cuadras que haya
 * movido de territorio), pero los polígonos, coordenadas y áreas se vuelven a
 * tomar del mapa base. Así, cuando la congregación emite una revisión nueva del
 * mapa, nadie se queda con el dibujo viejo ni pierde su historial.
 */
export function migrar(db: BaseDatos): BaseDatos {
  const base = baseInicial();

  const geometria = new Map<string, Cuadra>();
  for (const t of base.territorios) {
    for (const c of t.cuadras) geometria.set(c.origen, c);
  }

  const guardados = db.territorios?.length ? db.territorios : base.territorios;
  const vistas = new Set<string>();

  const territorios: Territorio[] = guardados.map((t) => {
    const delMapa = base.territorios.find((x) => x.id === t.id);
    const cuadras = t.cuadras.map((c) => {
      const origen = c.origen ?? c.id;
      vistas.add(origen);
      const g = geometria.get(origen);
      return g
        ? { ...g, id: c.id, origen, letra: c.letra, activa: c.activa ?? true, notas: c.notas }
        : { ...c, origen };
    });
    return {
      ...(delMapa ?? t),
      ...t,
      etiquetaLatLng: delMapa?.etiquetaLatLng ?? t.etiquetaLatLng,
      cuadras,
    };
  });

  // Cuadras que el mapa nuevo trae y la base guardada no tenía.
  for (const t of base.territorios) {
    const faltantes = t.cuadras.filter((c) => !vistas.has(c.origen));
    if (!faltantes.length) continue;
    const destino = territorios.find((x) => x.id === t.id);
    if (destino) {
      destino.cuadras = [...destino.cuadras, ...faltantes].sort((a, b) =>
        a.letra.localeCompare(b.letra, "es"),
      );
    } else {
      territorios.push({ ...t, cuadras: faltantes });
    }
  }

  // El catálogo de «capitanes» pasó a ser de «personas»: los capitanes que ya
  // existían se conservan tal cual, marcados como capitanes de grupo.
  const antiguos = (db as Partial<BaseDatos> & { capitanes?: PersonaAntigua[] }).capitanes;
  // La disponibilidad pasó de ser una lista de días a una matriz día × modalidad.
  const aMatriz = (dias?: number[]): Record<string, number[]> => {
    const d = dias ?? [0, 1, 2, 3, 4, 5, 6];
    return { manana: [...d], tarde: [...d] };
  };
  const normalizarPersona = (p: Persona & { diasDisponibles?: number[] }): Persona => ({
    ...p,
    esCapitan: p.esCapitan ?? true,
    disponibilidad: p.disponibilidad ?? aMatriz(p.diasDisponibles),
  });
  const personas: Persona[] = db.personas?.length
    ? db.personas.map((p) => normalizarPersona(p as Persona & { diasDisponibles?: number[] }))
    : (antiguos ?? []).map((c) => ({
        id: c.id,
        nombre: c.nombre,
        telefono: c.telefono,
        activo: c.activo ?? true,
        esCapitan: true,
        disponibilidad: aMatriz(c.diasDisponibles),
        notas: c.notas,
      }));

  // Los turnos fijos se volvieron modalidades con identificador, y la jornada
  // dejó de cargar cuadras/punto de reunión: eso ahora se anuncia el mismo día
  // sin objeto persistido (ver `domain/anuncio.ts`); un renglón de rol viejo
  // solo aporta fecha, modalidad y capitán.
  const jornadas: Jornada[] = (db.jornadas ?? []).map((j) => {
    const vieja = j as Jornada & { turno?: string };
    return {
      id: j.id,
      fecha: j.fecha,
      modalidadId: j.modalidadId ?? vieja.turno ?? "manana",
      capitanId: j.capitanId ?? null,
      notas: j.notas,
      creada: j.creada,
    };
  });

  const geometriaEditada = db.geometriaEditada ?? {};

  const salida: BaseDatos = {
    ...base,
    ...db,
    version: VERSION_BD,
    config: {
      ...base.config,
      ...db.config,
      modalidades: db.config?.modalidades?.length
        ? db.config.modalidades
        : base.config.modalidades,
      notaRol: db.config?.notaRol ?? base.config.notaRol,
    },
    territorios: aplicarGeometriaEditada(territorios, geometriaEditada),
    personas,
    jornadas,
    asignaciones: db.asignaciones ?? [],
    eventos: db.eventos ?? [],
    geometriaEditada,
  };
  delete (salida as Partial<BaseDatos> & { capitanes?: unknown }).capitanes;
  if (!salida.ciclos.length) salida.ciclos = base.ciclos;
  return salida;
}

interface PersonaAntigua {
  id: string;
  nombre: string;
  telefono?: string;
  activo?: boolean;
  diasDisponibles?: number[];
  notas?: string;
}

export const cicloAbierto = (db: BaseDatos) => db.ciclos.find((c) => c.fin === null) ?? null;
