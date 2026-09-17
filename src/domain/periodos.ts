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
  letras: string[];
  /** El territorio quedó cubierto por completo a más tardar ese día. */
  terminado: boolean;
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
  /** Nombre de la modalidad que dirigió, p.ej. "Mañana". */
  modalidad: string;
  /**
   * `null` cuando hay registros a su nombre. Se mira por encargado y no por
   * día completo porque las modalidades se reportan por separado: si el de la
   * tarde entregó su informe y el de la mañana no, el día tiene datos pero
   * igual le falta la mitad.
   */
  marca: MarcaEncargado | null;
}

export interface DiaDelPeriodo {
  fecha: Fecha;
  territorios: TrabajoTerritorioDia[];
  cuadras: number;
  /** Encargados con jornada de territorio ese día, hayan reportado o no. */
  encargados: EncargadoDia[];
  /** Hubo encargado asignado y el día quedó sin un solo registro. */
  faltaInforme: boolean;
  /** Hay trabajo registrado, pero a nombre de alguien fuera del rol del día. */
  hayDescuadre: boolean;
}

function encargadosDe(
  db: BaseDatos,
  jornadas: Jornada[],
  capitanesConRegistro: Set<string>,
  fecha: Fecha,
  hoyF: Fecha,
  cuadras: number,
): EncargadoDia[] {
  const conTerritorio = new Map(
    db.config.modalidades.filter((m) => m.conTerritorio).map((m) => [m.id, m.nombre]),
  );
  const marcar = (capitanId: string): MarcaEncargado | null => {
    if (capitanesConRegistro.has(capitanId)) return null;
    if (fecha > hoyF) return null;
    if (fecha === hoyF) return "pendiente";
    return cuadras === 0 ? "falta" : "descuadre";
  };
  const vistos = new Set<string>();
  const out: EncargadoDia[] = [];
  for (const j of jornadas) {
    const modalidad = conTerritorio.get(j.modalidadId);
    if (!modalidad || !j.capitanId) continue;
    const nombre = db.personas.find((p) => p.id === j.capitanId)?.nombre;
    if (!nombre) continue;
    const clave = `${j.capitanId}|${j.modalidadId}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    out.push({ nombre, modalidad, marca: marcar(j.capitanId) });
  }
  return out;
}

/** Qué se trabajó cada día del periodo, día por día. */
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

  const hoyF = hoy();
  return fechasDe(periodo).map((fecha) => {
    const porTerritorio = new Map<number, Set<string>>();
    const capitanesConRegistro = new Set<string>();
    let cuadras = 0;
    for (const r of registrosPorFecha.get(fecha) ?? []) {
      if (r.capitanId) capitanesConRegistro.add(r.capitanId);
      const v = indice.cuadras.get(r.cuadraId);
      if (!v) continue;
      const letras = porTerritorio.get(v.territorio.id) ?? new Set<string>();
      letras.add(v.cuadra.letra);
      porTerritorio.set(v.territorio.id, letras);
      cuadras += 1;
    }
    const territorios = [...porTerritorio.entries()]
      .map(([territorioId, letras]): TrabajoTerritorioDia => {
        const territorio = db.territorios.find((t) => t.id === territorioId)!;
        const activas = territorio.cuadras.filter((c) => c.activa);
        const terminado =
          activas.length > 0 &&
          activas.every(
            (c) => indice.cuadras.get(c.id)?.historial.some((r) => r.fecha <= fecha) ?? false,
          );
        return {
          territorio,
          letras: [...letras].sort((a, b) => a.localeCompare(b, "es", { numeric: true })),
          terminado,
        };
      })
      .sort((a, b) => a.territorio.id - b.territorio.id);

    const encargados = encargadosDe(
      db, jornadasPorFecha.get(fecha) ?? [], capitanesConRegistro, fecha, hoyF, cuadras,
    );
    return {
      fecha,
      territorios,
      cuadras,
      encargados,
      faltaInforme: encargados.some((e) => e.marca === "falta"),
      hayDescuadre: encargados.some((e) => e.marca === "descuadre"),
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
    for (const t of d.territorios) {
      tocados.add(t.territorio.id);
      if (t.terminado) completados.add(t.territorio.id);
    }
    for (const e of d.encargados) capitanes.add(e.nombre);
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
