import bruto from "../data/mapa.json";
import type { LatLng, MapaBase } from "./tipos";

/**
 * Mapa base extraído del PDF de la congregación y georreferenciado contra la red
 * vial real de OpenStreetMap (ver `tools/` para regenerarlo). Es de solo lectura:
 * la geometría vive aquí, los datos editables en la base de datos.
 */
export const mapaBase = bruto as unknown as MapaBase;

export const GEO = mapaBase.meta.geo;

export function areaTexto(m2: number): string {
  return m2 >= 10_000
    ? `${(m2 / 10_000).toFixed(2)} ha`
    : `${Math.round(m2).toLocaleString("es-MX")} m²`;
}

export const ZONAS_MAPA = mapaBase.zonas.map((z) => z.nombre).sort();

const ORIGENES_MAPA_BASE = new Set(
  mapaBase.territorios.flatMap((t) => t.cuadras.map((c) => c.id)),
);

/** `false` si la cuadra no viene del mapa base (se dio de alta a mano en la app). */
export function esCuadraDelMapaBase(origen: string): boolean {
  return ORIGENES_MAPA_BASE.has(origen);
}

export const COLOR_REFERENCIA: Record<string, string> = {
  Escuela: "#2e3092",
  Iglesia: "#f5821f",
  Jardin: "#00a650",
  "Lote baldio": "#f9a01b",
  "Estacion combustible": "#ed1c24",
};

const R = 6_371_000;

/** Distancia en metros entre dos coordenadas (haversine). */
export function distanciaM(a: LatLng, b: LatLng): number {
  const φ1 = (a[0] * Math.PI) / 180;
  const φ2 = (b[0] * Math.PI) / 180;
  const dφ = φ2 - φ1;
  const dλ = ((b[1] - a[1]) * Math.PI) / 180;
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Enlace para abrir una coordenada en la app de mapas del teléfono. */
export function enlaceMapas([lat, lng]: LatLng): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

/** Enlace de navegación paso a paso hacia una coordenada. */
export function enlaceRuta([lat, lng]: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

/**
 * Área y centroide de un anillo [lat,lng], proyectando a metros locales
 * (equirectangular, mismo radio que `distanciaM`) y aplicando la fórmula del
 * área de polígono (shoelace) sobre esa proyección. Suficiente para el
 * tamaño de una cuadra; no pretende igualar la precisión de una librería GIS.
 */
export function areaYCentroide(anillo: LatLng[]): { areaM2: number; centro: LatLng } {
  if (anillo.length < 3) return { areaM2: 0, centro: anillo[0] ?? [0, 0] };
  const lat0 = anillo.reduce((s, [la]) => s + la, 0) / anillo.length;
  const lon0 = anillo.reduce((s, [, lo]) => s + lo, 0) / anillo.length;
  const cosLat0 = Math.cos((lat0 * Math.PI) / 180);
  const puntos = anillo.map(([la, lo]) => [
    R * ((lo - lon0) * Math.PI) / 180 * cosLat0,
    R * ((la - lat0) * Math.PI) / 180,
  ]);

  let area2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < puntos.length; i++) {
    const [x0, y0] = puntos[i];
    const [x1, y1] = puntos[(i + 1) % puntos.length];
    const cruz = x0 * y1 - x1 * y0;
    area2 += cruz;
    cx += (x0 + x1) * cruz;
    cy += (y0 + y1) * cruz;
  }
  const areaM2 = Math.abs(area2) / 2;
  if (areaM2 === 0) {
    const [la, lo] = anillo[0];
    return { areaM2: 0, centro: [la, lo] };
  }
  cx /= 3 * area2;
  cy /= 3 * area2;
  const centro: LatLng = [lat0 + (cy * 180) / (Math.PI * R), lon0 + (cx * 180) / (Math.PI * R * cosLat0)];
  return { areaM2, centro };
}
