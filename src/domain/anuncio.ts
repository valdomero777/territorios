import type { VistaCuadra } from "./estado";
import type { Fecha } from "./tipos";
import { fechaLarga } from "./fechas";

/**
 * Texto tipo "buenos días, territorio para hoy" listo para compartir por
 * WhatsApp, agrupado por territorio como se comunica en la práctica.
 */
export function textoAnuncio(fecha: Fecha, modalidadNombre: string, vistas: VistaCuadra[]): string {
  const porTerritorio = new Map<number, VistaCuadra[]>();
  for (const v of vistas) {
    const lista = porTerritorio.get(v.territorio.id);
    if (lista) lista.push(v);
    else porTerritorio.set(v.territorio.id, [v]);
  }

  const lineas = [...porTerritorio.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, cuadrasDelTerritorio]) => {
      const territorio = cuadrasDelTerritorio[0].territorio;
      const activasDelTerritorio = territorio.cuadras.filter((c) => c.activa).length;
      const completo = cuadrasDelTerritorio.length >= activasDelTerritorio;
      const letras = cuadrasDelTerritorio.map((v) => v.cuadra.letra).sort();
      return completo
        ? `${territorio.nombre} completo`
        : `${territorio.nombre}: manzanas ${letras.join(", ")}`;
    });

  return [`Buenos días, territorio para hoy (${modalidadNombre}, ${fechaLarga(fecha)}):`, ...lineas].join("\n");
}

/** Comparte texto por WhatsApp/etc, o lo copia al portapapeles si no hay share nativo. */
export async function compartirTexto(texto: string): Promise<void> {
  if (navigator.share) {
    try {
      await navigator.share({ title: "Territorio para hoy", text: texto });
      return;
    } catch {
      /* el usuario canceló: caemos al portapapeles */
    }
  }
  await navigator.clipboard.writeText(texto);
  alert("Texto copiado al portapapeles.");
}
