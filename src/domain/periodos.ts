/**
 * Periodos de análisis: tramos de fechas arbitrarios sobre los que mirar la
 * bitácora.
 *
 * Existe aparte de `estado.ts` porque aquello responde "¿cómo está cada cuadra
 * HOY?" y esto responde "¿qué pasó ENTRE estas dos fechas?". Son preguntas
 * distintas: la primera mira el último registro de cada cuadra, la segunda mira
 * todos los registros de una ventana, aunque la cuadra se haya vuelto a
 * trabajar después.
 */

import { cicloDe } from "./db";
import { diaSemana, diasEntre, fechaCorta, hoy, sumarDias } from "./fechas";
import type { Indice } from "./estado";
import type { BaseDatos, Fecha, Jornada, Territorio } from "./tipos";

/** La semana de servicio de la congregación va de martes a domingo. */
export const DIA_INICIO_SEMANA = 2;
/** Días que abarca: martes a domingo. El lunes no hay salida. */
export const LARGO_SEMANA = 6;

export interface Periodo {
  inicio: Fecha;
  fin: Fecha;
}

/** Ordena los extremos: un rango al revés se endereza en vez de quedar vacío. */
export function normalizar(p: Periodo): Periodo {
  return p.fin < p.inicio ? { inicio: p.fin, fin: p.inicio } : p;
}

/** El martes de la semana de servicio que contiene a `f`. */
export function inicioSemanaDe(f: Fecha): Fecha {
  return sumarDias(f, -((diaSemana(f) - DIA_INICIO_SEMANA + 7) % 7));
}

/** La semana de servicio que contiene a `f`. */
export function semanaDe(f: Fecha): Periodo {
  const inicio = inicioSemanaDe(f);
  return { inicio, fin: sumarDias(inicio, LARGO_SEMANA - 1) };
}

/** ¿Es exactamente una semana de servicio (martes a domingo)? */
export function esSemanaDeServicio(p: Periodo): boolean {
  return diaSemana(p.inicio) === DIA_INICIO_SEMANA && diasEntre(p.inicio, p.fin) === LARGO_SEMANA - 1;
}

export function largoEnDias(p: Periodo): number {
  return diasEntre(p.inicio, p.fin) + 1;
}

/**
 * Corre el periodo hacia atrás o adelante. Una semana de servicio avanza de 7
 * en 7 para caer siempre en martes —aunque solo abarque 6 días—; un rango
 * hecho a mano avanza por su propio largo, para que ← y → recorran el
 * calendario sin huecos ni traslapes.
 */
export function desplazar(p: Periodo, pasos: number): Periodo {
  const salto = (esSemanaDeServicio(p) ? 7 : largoEnDias(p)) * pasos;
  return { inicio: sumarDias(p.inicio, salto), fin: sumarDias(p.fin, salto) };
}

export function fechasDe(p: Periodo): Fecha[] {
  const { inicio, fin } = normalizar(p);
  const out: Fecha[] = [];
  for (let f = inicio; f <= fin; f = sumarDias(f, 1)) out.push(f);
  return out;
}

/** "Mar 15 sep al Dom 20 sep" */
export function textoPeriodo(p: Periodo): string {
  const { inicio, fin } = normalizar(p);
  return inicio === fin ? fechaCorta(inicio) : `${fechaCorta(inicio)} al ${fechaCorta(fin)}`;
}

export interface TrabajoTerritorioDia {
  territorio: Territorio;
  /** Letras de las cuadras trabajadas ESE día y en ESE turno. Nada más. */
  letras: string[];
}

/**
 * Por qué un encargado del rol no tiene registros a su nombre ese día:
 *  - `falta`:      el día entero quedó vacío. Es el hueco de verdad.
 *  - `descuadre`:  sí se registró trabajo ese día, pero a nombre de otro. O
 *                  salió alguien más, o el registro quedó bajo un duplicado
 *                  del catálogo de personas. El dato está; lo que no cuadra
 *                  es a quién se le acredita.
 *  - `pendiente`:  es hoy y el informe todavía puede llegar.
 */
export type MarcaEncargado = "falta" | "descuadre" | "pendiente";

export interface EncargadoDia {
  nombre: string;
  /**
   * `null` cuando hay registros a su nombre. Se mira por encargado y no por
   * día completo porque las modalidades se reportan por separado: si el de la
   * tarde entregó su informe y el de la mañana no, el día tiene datos pero
   * igual le falta la mitad.
   */
  marca: MarcaEncargado | null;
}

/** Cajón donde cae el trabajo que no se pudo atribuir a ningún turno. */
export const SIN_TURNO = "__sin_turno";

/**
 * Un turno del día (mañana, tarde…) con lo que se trabajó en él.
 *
 * El `Registro` no guarda la modalidad —solo la persona—, así que el turno se
 * deduce del rol: a qué modalidad estaba asignado ese día el hermano a cuyo
 * nombre quedó el registro. Cuando no se puede deducir (registro sin
 * encargado, encargado fuera del rol de ese día, o el mismo hermano asignado
 * a dos modalidades a la vez) el trabajo cae en `SIN_TURNO` en vez de
 * repartirse a la adivina.
 */
export interface TurnoDia {
  clave: string;
  /** Nombre de la modalidad, p.ej. "Mañana". */
  modalidad: string;
  orden: number;
  /** Encargados del rol para ese turno, hayan reportado o no. */
  encargados: EncargadoDia[];
  territorios: TrabajoTerritorioDia[];
  cuadras: number;
}

export interface DiaDelPeriodo {
  fecha: Fecha;
  /** Lo trabajado ese día, partido por turno. */
  turnos: TurnoDia[];
  cuadras: number;
  /**
   * Territorios que quedaron cubiertos por completo ESE día: al cerrar el día
   * anterior les faltaba al menos una cuadra de la vuelta y al cerrar éste ya
   * no. No se confunde con lo trabajado en el día, que va en los turnos.
   */
  completados: Territorio[];
  /** Hubo encargado asignado y el día quedó sin un solo registro. */
  faltaInforme: boolean;
  /** Hay trabajo registrado, pero a nombre de alguien fuera del rol del día. */
  hayDescuadre: boolean;
}

/**
 * Turnos a los que estaba asignado cada encargado ese día. Si alguien sale en
 * dos, su trabajo ya no se puede repartir entre ellos.
 */
function turnosPorCapitan(jornadas: Jornada[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const j of jornadas) {
    if (!j.capitanId) continue;
    const previos = m.get(j.capitanId) ?? [];
    if (!previos.includes(j.modalidadId)) m.set(j.capitanId, [...previos, j.modalidadId]);
  }
  return m;
}

/** Territorios que ese día pasaron de incompletos a completos en su vuelta. */
function completadosEse(
  db: BaseDatos,
  indice: Indice,
  territorios: Territorio[],
  fecha: Fecha,
): Territorio[] {
  // Sin ciclos la pregunta es "¿se trabajó alguna vez?"; con ciclos, "¿se
  // trabajó en la vuelta en curso?" — si no, un territorio cerrado hace dos
  // años volvería a anunciarse como recién completado.
  const ciclo = db.config.politicaCiclo === "sinCiclo" ? null : cicloDe(db, fecha);
  const completoAl = (t: Territorio, limite: (f: Fecha) => boolean) =>
    t.cuadras
      .filter((c) => c.activa)
      .every((c) =>
        (indice.cuadras.get(c.id)?.historial ?? []).some(
          (r) => limite(r.fecha) && (ciclo === null || r.cicloId === ciclo),
        ),
      );
  return territorios.filter(
    (t) =>
      t.cuadras.some((c) => c.activa) &&
      completoAl(t, (f) => f <= fecha) &&
      !completoAl(t, (f) => f < fecha),
  );
}

/** Qué se trabajó cada día del periodo, día por día y turno por turno. */
export function desglosePorDia(db: BaseDatos, indice: Indice, periodo: Periodo): DiaDelPeriodo[] {
  const registrosPorFecha = new Map<Fecha, typeof db.registros>();
  for (const r of db.registros) {
    const lista = registrosPorFecha.get(r.fecha);
    if (lista) lista.push(r);
    else registrosPorFecha.set(r.fecha, [r]);
  }
  const jornadasPorFecha = new Map<Fecha, Jornada[]>();
  for (const j of db.jornadas) {
    const lista = jornadasPorFecha.get(j.fecha);
    if (lista) lista.push(j);
    else jornadasPorFecha.set(j.fecha, [j]);
  }
  const modalidades = new Map(db.config.modalidades.map((m) => [m.id, m]));

  const hoyF = hoy();
  return fechasDe(periodo).map((fecha) => {
    const registros = registrosPorFecha.get(fecha) ?? [];
    const jornadas = (jornadasPorFecha.get(fecha) ?? []).filter((j) => j.capitanId);
    const deCapitan = turnosPorCapitan(jornadas);

    /** clave de turno -> territorioId -> letras trabajadas. */
    const porTurno = new Map<string, Map<number, Set<string>>>();
    const capitanesConRegistro = new Set<string>();
    const tocados = new Set<number>();
    let cuadras = 0;
    for (const r of registros) {
      if (r.capitanId) capitanesConRegistro.add(r.capitanId);
      const v = indice.cuadras.get(r.cuadraId);
      if (!v) continue;
      const suyos = r.capitanId ? deCapitan.get(r.capitanId) ?? [] : [];
      const clave = suyos.length === 1 ? suyos[0] : SIN_TURNO;
      const porTerritorio = porTurno.get(clave) ?? new Map<number, Set<string>>();
      const letras = porTerritorio.get(v.territorio.id) ?? new Set<string>();
      letras.add(v.cuadra.letra);
      porTerritorio.set(v.territorio.id, letras);
      porTurno.set(clave, porTerritorio);
      tocados.add(v.territorio.id);
      cuadras += 1;
    }

    const marcar = (capitanId: string): MarcaEncargado | null => {
      if (capitanesConRegistro.has(capitanId)) return null;
      if (fecha > hoyF) return null;
      if (fecha === hoyF) return "pendiente";
      return cuadras === 0 ? "falta" : "descuadre";
    };

    const trabajoDe = (clave: string): TrabajoTerritorioDia[] =>
      [...(porTurno.get(clave) ?? new Map<number, Set<string>>()).entries()]
        .map(([territorioId, letras]) => ({
          territorio: db.territorios.find((t) => t.id === territorioId)!,
          letras: [...letras].sort((a, b) => a.localeCompare(b, "es", { numeric: true })),
        }))
        .sort((a, b) => a.territorio.id - b.territorio.id);

    // Sale un turno por cada modalidad con encargado en el rol —aunque no haya
    // capturado nada, que es justo el hueco que interesa ver— y por cada
    // modalidad que acabó con registros encima.
    const claves = new Set<string>([
      ...jornadas
        .filter((j) => modalidades.get(j.modalidadId)?.conTerritorio ?? false)
        .map((j) => j.modalidadId),
      ...porTurno.keys(),
    ]);

    const turnos: TurnoDia[] = [...claves]
      .map((clave): TurnoDia => {
        const modalidad = modalidades.get(clave);
        const vistos = new Set<string>();
        const encargados: EncargadoDia[] = [];
        for (const j of jornadas) {
          if (j.modalidadId !== clave || vistos.has(j.capitanId!)) continue;
          const nombre = db.personas.find((p) => p.id === j.capitanId)?.nombre;
          if (!nombre) continue;
          vistos.add(j.capitanId!);
          encargados.push({ nombre, marca: marcar(j.capitanId!) });
        }
        const territorios = trabajoDe(clave);
        return {
          clave,
          modalidad: modalidad?.nombre ?? (clave === SIN_TURNO ? "Sin turno" : clave),
          // El cajón de lo no atribuible va siempre hasta abajo.
          orden: clave === SIN_TURNO ? Number.MAX_SAFE_INTEGER : modalidad?.orden ?? 0,
          encargados,
          territorios,
          cuadras: territorios.reduce((s, t) => s + t.letras.length, 0),
        };
      })
      .sort((a, b) => a.orden - b.orden || a.modalidad.localeCompare(b.modalidad, "es"));

    const marcas = turnos.flatMap((t) => t.encargados.map((e) => e.marca));
    return {
      fecha,
      turnos,
      cuadras,
      completados: completadosEse(
        db,
        indice,
        db.territorios.filter((t) => tocados.has(t.id)),
        fecha,
      ),
      faltaInforme: marcas.includes("falta"),
      hayDescuadre: marcas.includes("descuadre"),
    };
  });
}

export interface ResumenPeriodo {
  cuadras: number;
  diasConSalida: number;
  diasSinRegistro: number;
  /** Días con encargado asignado y ningún registro: dato probablemente faltante. */
  diasSinInforme: number;
  /** Días con trabajo registrado a nombre de alguien fuera del rol. */
  diasDescuadrados: number;
  territoriosTocados: number;
  territoriosCompletados: number;
  capitanes: number;
}

export function resumenPeriodo(dias: DiaDelPeriodo[]): ResumenPeriodo {
  const tocados = new Set<number>();
  const completados = new Set<number>();
  const capitanes = new Set<string>();
  let cuadras = 0;
  let diasConSalida = 0;
  let diasSinInforme = 0;
  let diasDescuadrados = 0;
  for (const d of dias) {
    cuadras += d.cuadras;
    if (d.cuadras > 0) diasConSalida += 1;
    if (d.faltaInforme) diasSinInforme += 1;
    if (d.hayDescuadre) diasDescuadrados += 1;
    for (const t of d.completados) completados.add(t.id);
    for (const turno of d.turnos) {
      for (const t of turno.territorios) tocados.add(t.territorio.id);
      for (const e of turno.encargados) capitanes.add(e.nombre);
    }
  }
  return {
    cuadras,
    diasConSalida,
    diasSinRegistro: dias.length - diasConSalida,
    diasSinInforme,
    diasDescuadrados,
    territoriosTocados: tocados.size,
    territoriosCompletados: completados.size,
    capitanes: capitanes.size,
  };
}
