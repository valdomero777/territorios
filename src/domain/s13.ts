/**
 * Registro de asignación de territorio (formato S-13).
 *
 * Reproduce el renglón que hoy se llena a mano: por territorio, la última fecha
 * en que se completó y hasta cuatro bloques de «asignado a / fecha en que se
 * asignó / fecha en que se completó».
 */

import { desdeFecha } from "./fechas";
import type { AsignacionTerritorio, BaseDatos, Fecha, Persona, Territorio } from "./tipos";

/** Bloques de asignación que caben en una hoja del formato oficial. */
export const BLOQUES_S13 = 4;

/**
 * El año de servicio va de septiembre a agosto: septiembre de 2025 ya pertenece
 * al año de servicio 2026, que es como viene rotulado el formato.
 */
export function anioServicioDe(fecha: Fecha): number {
  const d = desdeFecha(fecha);
  return d.getMonth() >= 8 ? d.getFullYear() + 1 : d.getFullYear();
}

export function rangoAnioServicio(anio: number): { inicio: Fecha; fin: Fecha } {
  return { inicio: `${anio - 1}-09-01`, fin: `${anio}-08-31` };
}

/** Formato de fecha del S-13: dd/mm/aa. */
export function fechaS13(f: Fecha | null | undefined): string {
  if (!f) return "";
  const [a, m, d] = f.split("-");
  return `${d}/${m}/${a.slice(2)}`;
}

export interface BloqueS13 {
  asignacion: AsignacionTerritorio;
  persona: Persona | undefined;
}

export interface RenglonS13 {
  territorio: Territorio;
  /** Columna de acarreo: última vez completado antes del año reportado. */
  ultimaVezCompletado: Fecha | null;
  bloques: BloqueS13[];
  /** Asignaciones del año que no cupieron en la hoja. */
  excedente: number;
}

export function asignacionesDe(db: BaseDatos, territorioId: number): AsignacionTerritorio[] {
  return db.asignaciones
    .filter((a) => a.territorioId === territorioId)
    .sort((x, y) => (x.fechaAsignacion < y.fechaAsignacion ? -1 : x.fechaAsignacion > y.fechaAsignacion ? 1 : 0));
}

/** La asignación abierta de un territorio, si alguien lo trae en este momento. */
export function asignacionAbierta(db: BaseDatos, territorioId: number): AsignacionTerritorio | null {
  return db.asignaciones.find((a) => a.territorioId === territorioId && a.fechaCompletado === null) ?? null;
}

/**
 * Última fecha en que el territorio se completó, mirando solo lo anterior al
 * año reportado. Si la app todavía no tenía registro, cae en el dato que se
 * capturó a mano en el territorio.
 */
export function ultimaVezCompletado(
  db: BaseDatos,
  territorio: Territorio,
  anioServicio: number,
): Fecha | null {
  const previas = db.asignaciones
    .filter(
      (a) =>
        a.territorioId === territorio.id &&
        a.fechaCompletado !== null &&
        a.anioServicio < anioServicio,
    )
    .map((a) => a.fechaCompletado as Fecha)
    .sort();
  return previas.length ? previas[previas.length - 1] : territorio.ultimaVezCompletado ?? null;
}

export function construirS13(
  db: BaseDatos,
  anioServicio: number,
  desde: number,
  hasta: number,
): RenglonS13[] {
  const personas = new Map(db.personas.map((p) => [p.id, p]));
  return db.territorios
    .filter((t) => t.id >= desde && t.id <= hasta)
    .sort((a, b) => a.id - b.id)
    .map((territorio) => {
      const delAnio = asignacionesDe(db, territorio.id).filter((a) => a.anioServicio === anioServicio);
      return {
        territorio,
        ultimaVezCompletado: ultimaVezCompletado(db, territorio, anioServicio),
        bloques: delAnio.slice(0, BLOQUES_S13).map((a) => ({
          asignacion: a,
          persona: personas.get(a.personaId),
        })),
        excedente: Math.max(0, delAnio.length - BLOQUES_S13),
      };
    });
}

/** Años de servicio con movimiento, del más reciente al más antiguo. */
export function aniosConDatos(db: BaseDatos): number[] {
  const s = new Set(db.asignaciones.map((a) => a.anioServicio));
  return [...s].sort((a, b) => b - a);
}
