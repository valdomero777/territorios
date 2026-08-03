/**
 * Arma un `mapa.json` actualizado incorporando las formas corregidas a mano
 * (`geometriaEditada`), para reemplazar `src/data/mapa.json` en el repo.
 * Aparte del resto del dominio porque es el único lugar que necesita
 * `polygon-clipping`/`polygon-offset` (recalcular el contorno rojo, unión de
 * cuadras) — no conviene que esas dependencias entren en el camino de
 * renderizado normal.
 */
import { union } from "polygon-clipping";
import type { Polygon } from "polygon-clipping";
import Offset from "polygon-offset";
import { areaYCentroide, mapaBase } from "./mapa";
import type { LatLng, MapaBase } from "./tipos";

// Las cuadras NO se tocan entre sí: entre una y otra va la calle. Mismo truco
// que `tools/generar_geo.py` (`MARGEN = 26.0  # metros; ancho típico de calle
// en esta traza`): agrandar cada cuadra el ancho de una calle antes de unir,
// para que la unión salte el hueco de la calle.
//
// El script de Python además reduce la unión ese mismo margen al final para
// que el contorno vuelva a pegarse a las cuadras reales; aquí NO se hace esa
// segunda pasada porque `polygon-offset` (la única librería JS liviana capaz
// de agrandar/reducir un polígono) tiene un bug real al reducir las figuras
// grandes y cóncavas que resultan de la unión (falla con "event is not
// defined" en dos de las tres piezas del territorio real). Agrandar sin
// reducir después dibuja un contorno ~26 m más ancho de lo exacto en todo su
// perímetro — visualmente casi igual, y bastante menos que el error de
// georreferencia ya reportado del mapa base (mediana 3.9 m, p90 11 m), así
// que no vale la pena una figura mucho más compleja para evitarlo.
const MARGEN_M = 26;
const MARGEN_GRADOS = MARGEN_M / 111_320; // aprox. metros -> grados (latitud)

/** Unión de todas las cuadras del mapa: el contorno rojo del territorio completo. */
export function recomputarContorno(anillos: LatLng[][]): LatLng[][] {
  const agrandados: Polygon[] = [];
  for (const anillo of anillos) {
    if (anillo.length < 4) continue; // cerrado: al menos 3 vértices + el de cierre
    const puntos = anillo.map(([lat, lng]) => [lat, lng] as [number, number]);
    for (const r of new Offset().data(puntos).margin(MARGEN_GRADOS)) {
      agrandados.push([r]);
    }
  }
  if (!agrandados.length) return [];

  const unionAgrandada = union(agrandados[0], ...agrandados.slice(1));
  return unionAgrandada.map((pieza) => pieza[0].map(([lat, lng]) => [lat, lng] as LatLng));
}

function limitesDe(anillos: LatLng[][]): [LatLng, LatLng] {
  let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
  for (const anillo of anillos) {
    for (const [lat, lng] of anillo) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
  }
  return [[minLat, minLng], [maxLat, maxLng]];
}

/**
 * Devuelve un `MapaBase` con las cuadras de `geometriaEditada` corregidas y el
 * contorno/área total/límites recalculados a partir de la geometría completa
 * resultante (editada + sin tocar).
 */
export function mapaActualizado(geometriaEditada: Record<string, LatLng[]>): MapaBase {
  const territorios = mapaBase.territorios.map((t) => ({
    ...t,
    cuadras: t.cuadras.map((c) => {
      const anillo = geometriaEditada[c.id];
      if (!anillo) return c;
      const { areaM2, centro: centroLatLng } = areaYCentroide(anillo);
      return { ...c, latlng: anillo, centroLatLng, areaM2 };
    }),
  }));

  const todosLosAnillos = territorios.flatMap((t) => t.cuadras.map((c) => c.latlng));
  const contorno = recomputarContorno(todosLosAnillos);
  const areaTotalM2 = territorios.reduce(
    (s, t) => s + t.cuadras.reduce((s2, c) => s2 + c.areaM2, 0),
    0,
  );
  const limites = limitesDe(todosLosAnillos);
  const centro: LatLng = [(limites[0][0] + limites[1][0]) / 2, (limites[0][1] + limites[1][1]) / 2];

  return {
    ...mapaBase,
    territorios,
    meta: {
      ...mapaBase.meta,
      geo: { ...mapaBase.meta.geo, contorno, areaTotalM2, limites, centro },
    },
  };
}
