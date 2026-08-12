/**
 * Modelo de dominio.
 *
 * Regla fundamental: la CUADRA es la unidad atómica de trabajo y de registro.
 * El estado de un territorio nunca se captura a mano, siempre se deriva de los
 * registros de sus cuadras (ver `domain/estado.ts`).
 */

export type ID = string;
export type Fecha = string; // YYYY-MM-DD
export type Instante = string; // ISO 8601

export interface Punto {
  x: number;
  y: number;
}

/** Coordenada real, [latitud, longitud]. */
export type LatLng = [number, number];

/** Una cuadra: el polígono más pequeño del mapa, p.ej. "13-F". */
export interface Cuadra {
  id: string;
  /**
   * Identificador original en el mapa base. `id` cambia si la cuadra se mueve de
   * territorio; éste no, y es el que permite refrescar la geometría cuando la
   * congregación emite una revisión nueva del mapa.
   */
  origen: string;
  letra: string;
  /** Path SVG extraído del mapa original (respaldo y reimpresión). */
  d: string;
  centro: Punto;
  /** Contorno en coordenadas reales, georreferenciado contra OpenStreetMap. */
  latlng: LatLng[];
  centroLatLng: LatLng;
  /** Superficie real en metros cuadrados. */
  areaM2: number;
  /** Área en unidades del mapa al cuadrado (geometría original del PDF). */
  areaU: number;
  activa: boolean;
  notas?: string;
}

export interface Territorio {
  id: number;
  nombre: string;
  zona: string;
  color: string;
  /** Posición del número de territorio en el mapa. */
  etiqueta: Punto;
  etiquetaLatLng: LatLng;
  activo: boolean;
  notas?: string;
  /**
   * Acarreo del S-13: la última fecha en que el territorio se completó *antes*
   * de que la app llevara el registro. Solo se usa mientras no exista una
   * asignación completada más reciente.
   */
  ultimaVezCompletado?: Fecha;
  cuadras: Cuadra[];
}

/**
 * Un hermano del catálogo. Cumple dos papeles distintos que conviene no mezclar:
 *  - recibe territorios asignados (es lo que registra el formato S-13);
 *  - opcionalmente dirige una salida diaria como capitán de grupo.
 */
export interface Persona {
  id: ID;
  nombre: string;
  telefono?: string;
  activo: boolean;
  /** Puede dirigir una jornada como encargado de grupo. */
  esCapitan: boolean;
  /**
   * Días de la semana en que puede encargarse de cada modalidad
   * (`{ manana: [2, 6], tarde: [4] }`, 0 = domingo … 6 = sábado).
   * Es la matriz de la hoja «CAPITANES»: la disponibilidad depende del día *y*
   * de la modalidad, no solo del día.
   */
  disponibilidad: Record<string, number[]>;
  notas?: string;
}

export interface PuntoReunion {
  id: ID;
  nombre: string;
  direccion?: string;
  activo: boolean;
  /** Ubicación real sobre el mapa, para que el capitán pueda llegar. */
  ubicacion?: LatLng;
  notas?: string;
}

/**
 * Dirección que no se debe visitar (oposición, Testigos, petición expresa, etc.).
 * Es el catálogo de "casas marcadas": vive fuera de la cuadra porque una casa
 * marcada no cambia el estado de trabajo de la cuadra completa, y porque no
 * siempre se conoce su ubicación exacta en el mapa desde el principio.
 */
export interface CasaMarcada {
  id: ID;
  territorioId: number;
  direccion: string;
  /** Ubicación exacta en el mapa; no siempre se conoce de entrada. */
  ubicacion?: LatLng;
  /** Fecha en que se marcó por primera vez. */
  fechaInicial?: Fecha;
  /** Última vez que se confirmó que sigue vigente la marca. */
  fechaVisita?: Fecha;
  /** Quién hizo la última revisión (texto libre, no siempre es alguien del catálogo de personas). */
  atendio?: string;
  activa: boolean;
  notas?: string;
}

/**
 * Forma de servicio de un día. La congregación maneja varias a la vez —mañana,
 * tarde, cartas, calles, zoom— y cada una lleva su propio encargado, así que no
 * basta con un turno de mañana y tarde.
 */
export interface Modalidad {
  id: string;
  nombre: string;
  orden: number;
  /** Si recorre cuadras del territorio. Cartas y Zoom no. */
  conTerritorio: boolean;
  activa: boolean;
}

export const MODALIDADES_POR_DEFECTO: Modalidad[] = [
  { id: "cartas", nombre: "Cartas", orden: 1, conTerritorio: false, activa: true },
  { id: "calles", nombre: "Calles", orden: 2, conTerritorio: false, activa: true },
  { id: "manana", nombre: "Mañana", orden: 3, conTerritorio: true, activa: true },
  { id: "tarde", nombre: "Tarde", orden: 4, conTerritorio: true, activa: true },
  { id: "zoom", nombre: "Zoom", orden: 5, conTerritorio: false, activa: true },
];

/** Día señalado que ocupa o altera la jornada: asamblea, día de campo, etc. */
export interface EventoEspecial {
  id: ID;
  fecha: Fecha;
  texto: string;
}

/**
 * Renglón del rol mensual: quién capitanea una modalidad en una fecha dada.
 * No carga cuadras ni punto de reunión — eso se decide y se comunica el mismo
 * día (ver `domain/anuncio.ts`), no se planifica con antelación.
 */
export interface Jornada {
  id: ID;
  fecha: Fecha;
  /** Id de la `Modalidad` (mañana, tarde, cartas, calles, zoom). */
  modalidadId: string;
  /** Id de la `Persona` que dirige la salida. */
  capitanId: ID | null;
  notas?: string;
  creada: Instante;
}

/**
 * Bitácora inmutable. Un registro dice "esta cuadra se trabajó este día".
 * Nunca se edita para "desmarcar": se elimina el registro equivocado y se
 * deja constancia. Todo el estado visible se calcula a partir de esto.
 */
export interface Registro {
  id: ID;
  cuadraId: string;
  fecha: Fecha;
  cicloId: ID;
  /** Id de la `Persona` a cuyo nombre queda el registro. */
  capitanId?: ID;
  /** Asignación S-13 que produjo el registro, si vino de cerrar una. */
  asignacionId?: ID;
  notas?: string;
  creado: Instante;
}

/**
 * Tenencia de un territorio por una persona: es exactamente el renglón que se
 * anota a mano en el formato S-13. Se asigna el territorio completo, la persona
 * lo trabaja durante días o semanas y lo devuelve completado.
 *
 * Es una capa distinta de la `Jornada` (la salida del día en grupo) y ambas
 * conviven: el S-13 es el registro formal ante la congregación.
 */
export interface AsignacionTerritorio {
  id: ID;
  territorioId: number;
  personaId: ID;
  fechaAsignacion: Fecha;
  /** `null` mientras la persona todavía trae el territorio. */
  fechaCompletado: Fecha | null;
  /** Año de servicio al que pertenece el renglón (septiembre a agosto). */
  anioServicio: number;
  notas?: string;
  creada: Instante;
}

/** Una vuelta completa al territorio de la congregación. */
export interface Ciclo {
  id: ID;
  nombre: string;
  inicio: Fecha;
  fin: Fecha | null;
}

/**
 * Política de ciclo:
 *  - `estricto`: no se puede reasignar una cuadra ya trabajada en el ciclo abierto.
 *  - `libre`:    se puede reasignar cuando haga falta; la app solo advierte.
 *  - `sinCiclo`: no hay vueltas, la prioridad es puramente por antigüedad.
 */
export type PoliticaCiclo = "estricto" | "libre" | "sinCiclo";

export interface Config {
  nombreCongregacion: string;
  /** Modalidades de servicio y su orden en el rol. */
  modalidades: Modalidad[];
  /** Nota al pie del rol impreso. */
  notaRol: string;
  politicaCiclo: PoliticaCiclo;
  /** Días bajo los cuales advertir al reasignar una cuadra recién trabajada. */
  diasAlertaRepeticion: number;
  /** Umbrales del semáforo de antigüedad, en días. */
  umbralReciente: number;
  umbralMedio: number;
  /** Meta de cuadras por semana, usada en la proyección de cierre de ciclo. */
  metaCuadrasSemana: number;
}

export interface BaseDatos {
  version: number;
  config: Config;
  territorios: Territorio[];
  personas: Persona[];
  puntosReunion: PuntoReunion[];
  casasMarcadas: CasaMarcada[];
  jornadas: Jornada[];
  registros: Registro[];
  asignaciones: AsignacionTerritorio[];
  eventos: EventoEspecial[];
  ciclos: Ciclo[];
  /**
   * Borrador de forma corregida a mano por cuadra (id → anillo de vértices),
   * mientras no se exporte un `mapa.json` nuevo con la corrección incorporada.
   * Gana sobre la geometría del mapa base (ver `domain/db.ts`).
   */
  geometriaEditada: Record<string, LatLng[]>;
}

/* ---------------------------------------------------------------- mapa base */

export interface GeoMapa {
  metrosPorUnidad: number;
  /** Error mediano del ajuste contra las calles reales, en metros. */
  errorMedianoM: number;
  referenciasUsadas: number;
  limites: [LatLng, LatLng];
  centro: LatLng;
  areaTotalM2: number;
  /** Perímetro del territorio completo (la línea roja). Puede ser varias piezas. */
  contorno: LatLng[][];
}

export interface MetaMapa {
  origen: string;
  congregacion: string;
  revision: string;
  viewBox: [number, number, number, number];
  escala: { metrosPorUnidad: number; referencia: string } | null;
  geo: GeoMapa;
  totalTerritorios: number;
  totalCuadras: number;
}

export interface EtiquetaCalle {
  t: string;
  x: number;
  y: number;
  rot: number;
  s: number;
}

export type TipoReferencia =
  | "Escuela"
  | "Iglesia"
  | "Jardin"
  | "Lote baldio"
  | "Estacion combustible";

export interface Referencia {
  tipo: TipoReferencia;
  d: string;
  latlng: LatLng[];
}

export interface MapaBase {
  meta: MetaMapa;
  territorios: {
    id: number;
    nombre: string;
    zona: string;
    color: string;
    etiqueta: Punto;
    etiquetaLatLng: LatLng;
    cuadras: {
      id: string;
      letra: string;
      d: string;
      centro: Punto;
      latlng: LatLng[];
      centroLatLng: LatLng;
      areaM2: number;
      areaU: number;
    }[];
  }[];
  zonas: { nombre: string; x: number; y: number; latlng: LatLng }[];
  referencias: Referencia[];
  calles: EtiquetaCalle[];
}
