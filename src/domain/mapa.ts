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
