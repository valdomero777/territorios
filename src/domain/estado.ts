/**
 * Estado derivado.
 *
 * Nada de lo que hay aquí se guarda: todo se calcula desde la bitácora de
 * registros. Ese es el motivo por el que el historial nunca se corrompe
 * aunque dos personas trabajen a la vez.
 */

import { diasEntre } from "./fechas";
import { distanciaM } from "./mapa";
import type { BaseDatos, Cuadra, Registro, Territorio } from "./tipos";

export type EstadoCuadra = "trabajada" | "pendiente" | "inactiva";
export type Antiguedad = "reciente" | "medio" | "viejo" | "nunca";

export interface VistaCuadra {
  cuadra: Cuadra;
  territorio: Territorio;
  /** Todos sus registros, del más reciente al más antiguo. */
  historial: Registro[];
  ultimo: Registro | null;
  /** Días desde el último trabajo, o null si nunca se ha trabajado. */
  diasDesde: number | null;
  /** ¿Ya se trabajó dentro del ciclo abierto? */
  enCiclo: boolean;
  estado: EstadoCuadra;
  antiguedad: Antiguedad;
}

export interface Indice {
  /** Vista de cada cuadra, por id ("13-F"). */
  cuadras: Map<string, VistaCuadra>;
  /** Vistas agrupadas por territorio. */
  porTerritorio: Map<number, VistaCuadra[]>;
  /** Todas las vistas, en orden de territorio y letra. */
  todas: VistaCuadra[];
}

export function construirIndice(db: BaseDatos): Indice {
  const abierto = db.ciclos.find((c) => c.fin === null) ?? null;

  const porCuadra = new Map<string, Registro[]>();
  for (const r of db.registros) {
    const lista = porCuadra.get(r.cuadraId);
    if (lista) lista.push(r);
    else porCuadra.set(r.cuadraId, [r]);
  }
  for (const lista of porCuadra.values()) {
    lista.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
  }

  const cuadras = new Map<string, VistaCuadra>();
  const porTerritorio = new Map<number, VistaCuadra[]>();
  const todas: VistaCuadra[] = [];

  for (const territorio of db.territorios) {
    const lista: VistaCuadra[] = [];
    for (const cuadra of territorio.cuadras) {
      const historial = porCuadra.get(cuadra.id) ?? [];
      const ultimo = historial[0] ?? null;
      const diasDesde = ultimo ? diasEntre(ultimo.fecha) : null;
      const enCiclo = abierto ? historial.some((r) => r.cicloId === abierto.id) : false;

      let estado: EstadoCuadra;
      if (!cuadra.activa || !territorio.activo) estado = "inactiva";
      else if (db.config.politicaCiclo === "sinCiclo") {
        estado = ultimo ? "trabajada" : "pendiente";
      } else estado = enCiclo ? "trabajada" : "pendiente";

      const antiguedad: Antiguedad =
        diasDesde === null
          ? "nunca"
          : diasDesde <= db.config.umbralReciente
            ? "reciente"
            : diasDesde <= db.config.umbralMedio
              ? "medio"
              : "viejo";

      const vista: VistaCuadra = {
        cuadra, territorio, historial, ultimo, diasDesde,
        enCiclo, estado, antiguedad,
      };
      cuadras.set(cuadra.id, vista);
      lista.push(vista);
      todas.push(vista);
    }
    porTerritorio.set(territorio.id, lista);
  }

  return { cuadras, porTerritorio, todas };
}

/* ------------------------------------------------------------- resúmenes */

export interface ResumenTerritorio {
  territorio: Territorio;
  total: number;
  trabajadas: number;
  pendientes: number;
  avance: number; // 0..1
  areaM2: number;
  /** Días desde el trabajo más reciente en cualquiera de sus cuadras. */
  diasDesde: number | null;
  /** Días de la cuadra más olvidada (la que marca la prioridad). */
  diasMasViejo: number | null;
}

export function resumenTerritorio(vistas: VistaCuadra[], territorio: Territorio): ResumenTerritorio {
  const activas = vistas.filter((v) => v.estado !== "inactiva");
  const trabajadas = activas.filter((v) => v.estado === "trabajada").length;
  const dias = activas.map((v) => v.diasDesde).filter((d): d is number => d !== null);
  const hayNunca = activas.some((v) => v.diasDesde === null);
  return {
    territorio,
    total: activas.length,
    trabajadas,
    pendientes: activas.length - trabajadas,
    avance: activas.length ? trabajadas / activas.length : 0,
    areaM2: activas.reduce((s, v) => s + v.cuadra.areaM2, 0),
    diasDesde: dias.length ? Math.min(...dias) : null,
    diasMasViejo: hayNunca ? null : dias.length ? Math.max(...dias) : null,
  };
}

export function resumenesTerritorio(db: BaseDatos, indice: Indice): ResumenTerritorio[] {
  return db.territorios.map((t) => resumenTerritorio(indice.porTerritorio.get(t.id) ?? [], t));
}

export interface ResumenGlobal {
  totalCuadras: number;
  trabajadas: number;
  pendientes: number;
  avance: number;
  areaTotalM2: number;
  areaTrabajadaM2: number;
  territoriosCompletos: number;
  territoriosTotales: number;
  cuadrasNunca: number;
}

export function resumenGlobal(indice: Indice, resumenes: ResumenTerritorio[]): ResumenGlobal {
  const activas = indice.todas.filter((v) => v.estado !== "inactiva");
  const trabajadas = activas.filter((v) => v.estado === "trabajada");
  const conTerritorio = resumenes.filter((r) => r.total > 0);
  return {
    totalCuadras: activas.length,
    trabajadas: trabajadas.length,
    pendientes: activas.length - trabajadas.length,
    avance: activas.length ? trabajadas.length / activas.length : 0,
    areaTotalM2: activas.reduce((s, v) => s + v.cuadra.areaM2, 0),
    areaTrabajadaM2: trabajadas.reduce((s, v) => s + v.cuadra.areaM2, 0),
    territoriosCompletos: conTerritorio.filter((r) => r.avance === 1).length,
    territoriosTotales: conTerritorio.length,
    cuadrasNunca: activas.filter((v) => v.diasDesde === null).length,
  };
}

/**
 * Cuadras candidatas a trabajarse, de mayor a menor prioridad:
 * primero las nunca trabajadas, luego las más olvidadas.
 */
export function prioridad(indice: Indice): VistaCuadra[] {
  return indice.todas
    .filter((v) => v.estado === "pendiente")
    .sort((a, b) => {
      if (a.diasDesde === null && b.diasDesde === null) {
        return a.cuadra.id.localeCompare(b.cuadra.id, "es", { numeric: true });
      }
      if (a.diasDesde === null) return -1;
      if (b.diasDesde === null) return 1;
      return b.diasDesde - a.diasDesde;
    });
}

/** La última fecha en que se registró trabajo, y lo que se cubrió ese día. */
export function ultimaSalida(db: BaseDatos, indice: Indice) {
  if (!db.registros.length) return null;
  const fecha = db.registros.reduce((max, r) => (r.fecha > max ? r.fecha : max), db.registros[0].fecha);
  const registros = db.registros.filter((r) => r.fecha === fecha);
  const cuadras = registros
    .map((r) => indice.cuadras.get(r.cuadraId))
    .filter((v): v is VistaCuadra => Boolean(v));
  const capitanes = [...new Set(registros.map((r) => r.capitanId).filter(Boolean))] as string[];
  return { fecha, registros, cuadras, capitanes };
}

/**
 * Continuación natural del trabajo: las cuadras pendientes más cercanas a donde
 * se quedaron la última vez. Se camina, así que la distancia real importa más
 * que el número del territorio — y evita mandar al grupo al otro extremo.
 */
export function continuacion(db: BaseDatos, indice: Indice, cuantas = 8): VistaCuadra[] {
  const ultima = ultimaSalida(db, indice);
  const pendientes = indice.todas.filter((v) => v.estado === "pendiente");
  if (!ultima || ultima.cuadras.length === 0) return prioridad(indice).slice(0, cuantas);

  const anclas = ultima.cuadras.map((v) => v.cuadra.centroLatLng);
  return pendientes
    .map((v) => ({
      v,
      d: Math.min(...anclas.map((a) => distanciaM(a, v.cuadra.centroLatLng))),
    }))
    .sort((a, b) => a.d - b.d)
    .slice(0, cuantas)
    .map((x) => x.v);
}

/** Distancia en metros de una cuadra al conjunto de referencia. */
export function distanciaA(v: VistaCuadra, referencia: VistaCuadra[]): number | null {
  if (!referencia.length) return null;
  return Math.min(...referencia.map((r) => distanciaM(r.cuadra.centroLatLng, v.cuadra.centroLatLng)));
}
