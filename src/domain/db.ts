import { areaYCentroide, mapaBase } from "./mapa";
import { hoy } from "./fechas";
import { MODALIDADES_POR_DEFECTO } from "./tipos";
import type { BaseDatos, CasaMarcada, Config, Cuadra, Jornada, LatLng, Persona, Territorio } from "./tipos";

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

/**
 * Semilla del catálogo de "casas marcadas" (no visitar), tomada del control en
 * papel de la congregación ("Casas Marcadas 2026.pdf"). Las fechas venían como
 * "?" en varias filas: quedan sin capturar (`undefined`), no se inventan.
 */
export function casasMarcadasIniciales(): CasaMarcada[] {
  const filas: [number, string, string | null][] = [
    [1, "Aurora Boreal 203", "2025-01-26"],
    [4, "Av. Las Nubes 227", "2017-10-28"],
    [4, "Av. Las Nubes 229", "2017-10-28"],
    [4, "Nacarada 219", "2017-10-07"],
    [4, "Av. Las Nubes 203", "2024-01-26"],
    [6, "Privada Gema 103", "2016-06-01"],
    [11, "Valle Dorado 329", "2017-01-29"],
    [13, "Armenia 106", "2018-02-01"],
    [14, "Abisinia 130", null],
    [14, "Asiria 121", null],
    [15, "Sexta 112", null],
    [15, "16 de Septiembre 116", null],
    [17, "Rembrandt 226", "2016-09-11"],
    [17, "Rembrandt 229", "2016-09-11"],
    [17, "Tiziano 230", "2017-05-09"],
    [17, "Tiziano 226", "2017-05-09"],
    [17, "Leonardo Da Vinci 129", "2017-05-09"],
    [18, "Nicolas Hernandez 125", "2018-11-23"],
    [18, "Manuel Medina 149", "2018-11-23"],
    [18, "Lorenzo Avalos 105", "2019-09-26"],
    [19, "German Gedovius 140", "2016-12-17"],
    [20, "Agustin Castro 149", "2018-12-21"],
    [20, "Agustin Castro 171", "2018-12-21"],
    [21, "El Llano 206", null],
    [21, "El Llano 218", null],
    [21, "Pradera 324", null],
    [22, "Torneros 300", "2018-09-01"],
    [22, "Fogoneros 106", "2018-09-01"],
    [23, "San Jose 101", null],
    [24, "Calixto Contreras 154", "2016-09-02"],
    [24, "Torneros 123", "2016-09-02"],
    [24, "Torneros 117", "2018-09-21"],
    [24, "Severino Ceniceros 140", "2018-09-21"],
    [25, "Blas Corral 110", "2017-04-01"],
    [25, "Severino Ceniceros 116", "2018-10-01"],
    [27, "Miguel Laveaga 206", null],
    [27, "Donato Guerra 223", "2017-01-04"],
    [27, "Doroteo Arango 132", "2018-04-01"],
    [28, "Enrique R. Najera 227", "2018-04-01"],
    [28, "Doroteo Arango 212", null],
    [30, "Jose Vasconcelos 161", "2017-04-28"],
    [36, "Calle Huerto 111, Jardines del Real", "2026-04-14"],
  ];
  return filas.map(([territorioId, direccion, fechaInicial]) => ({
    id: nuevoId("casa"),
    territorioId,
    direccion,
    fechaInicial: fechaInicial ?? undefined,
    activa: true,
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
    casasMarcadas: casasMarcadasIniciales(),
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
    casasMarcadas: db.casasMarcadas ?? base.casasMarcadas,
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
