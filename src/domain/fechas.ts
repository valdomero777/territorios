import type { Fecha } from "./tipos";

/** Fecha local en formato YYYY-MM-DD (nunca UTC: rompería el corte del día). */
export function aFecha(d: Date): Fecha {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function hoy(): Fecha {
  return aFecha(new Date());
}

/** Convierte YYYY-MM-DD a Date local (evita el desfase de `new Date("...")`). */
export function desdeFecha(f: Fecha): Date {
  const [a, m, d] = f.split("-").map(Number);
  return new Date(a, m - 1, d);
}

export function diasEntre(desde: Fecha, hasta: Fecha = hoy()): number {
  const ms = desdeFecha(hasta).getTime() - desdeFecha(desde).getTime();
  return Math.round(ms / 86_400_000);
}

export function sumarDias(f: Fecha, dias: number): Fecha {
  const d = desdeFecha(f);
  d.setDate(d.getDate() + dias);
  return aFecha(d);
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const DIAS_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export const nombreDia = (n: number) => DIAS[n];
export const nombreDiaCorto = (n: number) => DIAS_CORTO[n];
export const nombreMes = (n: number) => MESES[n];

export function diaSemana(f: Fecha): number {
  return desdeFecha(f).getDay();
}

/** "12 de marzo de 2026" */
export function fechaLarga(f: Fecha): string {
  const d = desdeFecha(f);
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

/** "Mié 12 mar" */
export function fechaCorta(f: Fecha): string {
  const d = desdeFecha(f);
  return `${DIAS_CORTO[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
}

/** Clave de mes "2026-03". */
export function mesDe(f: Fecha): string {
  return f.slice(0, 7);
}

export function mesActual(): string {
  return hoy().slice(0, 7);
}

export function nombreMesLargo(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return `${MESES[m - 1]} de ${a}`;
}

/** Todas las fechas de un mes "2026-03". */
export function diasDelMes(mes: string): Fecha[] {
  const [a, m] = mes.split("-").map(Number);
  const total = new Date(a, m, 0).getDate();
  return Array.from({ length: total }, (_, i) => `${mes}-${String(i + 1).padStart(2, "0")}`);
}

export function mesSiguiente(mes: string, delta = 1): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Cuántos días tiene el texto "hace X días". */
export function haceTexto(dias: number | null): string {
  if (dias === null) return "nunca";
  if (dias === 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} días`;
  if (dias < 60) return "hace 1 mes";
  if (dias < 365) return `hace ${Math.round(dias / 30)} meses`;
  return `hace ${(dias / 365).toFixed(1)} años`;
}
