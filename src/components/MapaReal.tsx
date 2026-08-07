import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { GEO, mapaBase } from "../domain/mapa";
import type { LatLng } from "../domain/tipos";
import type { VistaCuadra } from "../domain/estado";

export type CapaFondo = "calles" | "satelite" | "sinFondo";

export const CAPAS: { clave: CapaFondo; nombre: string }[] = [
  { clave: "calles", nombre: "Calles" },
  { clave: "satelite", nombre: "Satélite" },
  { clave: "sinFondo", nombre: "Sin fondo (offline)" },
];

function crearFondo(capa: CapaFondo): L.TileLayer | null {
  if (capa === "sinFondo") return null;
  if (capa === "satelite") {
    return L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19, attribution: "Imágenes © Esri, Maxar, Earthstar Geographics" },
    );
  }
  return L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  });
}

export interface PropsMapaReal {
  vistas: VistaCuadra[];
  color: (v: VistaCuadra) => string;
  seleccion?: Set<string>;
  onCuadra?: (v: VistaCuadra) => void;
  /** Territorios a resaltar; el resto se atenúa. */
  foco?: Set<number> | null;
  capa: CapaFondo;
  /** Números de territorio sobre el mapa. */
  verNumeros?: boolean;
  /** Marcadores extra: puntos de reunión, ubicación del usuario… */
  marcadores?: { latlng: LatLng; titulo: string; tipo: "reunion" | "yo" }[];
  /** Si se define, un clic en cualquier parte devuelve la coordenada. */
  onClicMapa?: (latlng: LatLng) => void;
  centrarEn?: LatLng[] | null;
  /** Id de la cuadra en edición de forma: muestra sus vértices arrastrables. */
  editando?: string | null;
  /** Se llama con el anillo completo cada vez que cambia (arrastre, alta, baja). */
  onEditarVertices?: (cuadraId: string, anillo: LatLng[]) => void;
}

export function MapaReal({
  vistas, color, seleccion, onCuadra, foco, capa, verNumeros = true,
  marcadores = [], onClicMapa, centrarEn, editando = null, onEditarVertices,
}: PropsMapaReal) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const fondo = useRef<L.TileLayer | null>(null);
  const capaCuadras = useRef<L.LayerGroup | null>(null);
  const capaNumeros = useRef<L.LayerGroup | null>(null);
  const capaMarcadores = useRef<L.LayerGroup | null>(null);
  const capaVertices = useRef<L.LayerGroup | null>(null);
  const poligonos = useRef(new Map<string, L.Polygon>());
  const alClic = useRef(onCuadra);
  alClic.current = onCuadra;
  const alEditarVertices = useRef(onEditarVertices);
  alEditarVertices.current = onEditarVertices;

  /* --------------------------------------------------------------- montaje */
  useEffect(() => {
    if (!contenedor.current || mapa.current) return;

    const m = L.map(contenedor.current, {
      // El zoom de Leaflet va arriba a la izquierda por omisión, justo encima de
      // la barra de modos y filtros. Abajo a la derecha no estorba a nada y en el
      // teléfono queda al alcance del pulgar.
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true, // 240 polígonos: canvas va muy por delante de SVG en el teléfono
    });
    L.control.zoom({ position: "bottomright", zoomInTitle: "Acercar", zoomOutTitle: "Alejar" }).addTo(m);
    m.fitBounds(GEO.limites as L.LatLngBoundsExpression, { padding: [12, 12] });
    mapa.current = m;
    // Acceso al mapa desde la consola para diagnosticar en desarrollo.
    if (import.meta.env.DEV) (window as unknown as { __mapa?: L.Map }).__mapa = m;

    // Línea roja: el perímetro del territorio completo de la congregación.
    for (const anillo of GEO.contorno) {
      L.polygon(anillo as L.LatLngExpression[], {
        color: "#d03b3b",
        weight: 3,
        opacity: 0.95,
        fill: false,
        interactive: false,
        dashArray: undefined,
      }).addTo(m);
    }

    capaCuadras.current = L.layerGroup().addTo(m);
    capaNumeros.current = L.layerGroup().addTo(m);
    capaMarcadores.current = L.layerGroup().addTo(m);
    capaVertices.current = L.layerGroup().addTo(m);

    const registro = poligonos.current;
    return () => {
      m.remove();
      mapa.current = null;
      registro.clear();
    };
  }, []);

  /* ----------------------------------------------------------- capa de fondo */
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    if (fondo.current) {
      m.removeLayer(fondo.current);
      fondo.current = null;
    }
    const nueva = crearFondo(capa);
    if (nueva) {
      nueva.addTo(m);
      nueva.bringToBack();
      fondo.current = nueva;
    }
  }, [capa]);

  /* ---------------------------------------------------------------- cuadras */
  useEffect(() => {
    const grupo = capaCuadras.current;
    if (!grupo) return;
    grupo.clearLayers();
    poligonos.current.clear();

    for (const v of vistas) {
      const atenuada = foco && foco.size > 0 && !foco.has(v.territorio.id);
      const marcada = seleccion?.has(v.cuadra.id) ?? false;
      const p = L.polygon(v.cuadra.latlng as L.LatLngExpression[], {
        color: marcada ? "#0f172a" : "#ffffff",
        weight: marcada ? 3 : 1,
        opacity: atenuada ? 0.35 : 1,
        fillColor: color(v),
        fillOpacity: atenuada ? 0.12 : 0.68,
      });
      p.bindTooltip(`${v.territorio.nombre} · ${v.cuadra.letra}`, { sticky: true });
      p.on("click", (e) => {
        console.log("[diag] clic en cuadra", v.cuadra.id, "hayOnCuadra:", !!alClic.current);
        L.DomEvent.stopPropagation(e);
        alClic.current?.(v);
      });
      p.addTo(grupo);
      poligonos.current.set(v.cuadra.id, p);
    }
  }, [vistas, color, seleccion, foco]);

  /* ---------------------------------------------------------------- números */
  useEffect(() => {
    const grupo = capaNumeros.current;
    const m = mapa.current;
    if (!grupo || !m) return;
    grupo.clearLayers();
    if (!verNumeros) return;

    const dibujar = () => {
      grupo.clearLayers();
      if (m.getZoom() < 14) return;
      for (const t of mapaBase.territorios) {
        L.marker(t.etiquetaLatLng as L.LatLngExpression, {
          interactive: false,
          icon: L.divIcon({
            className: "num-terr",
            html: `<span>${t.id}</span>`,
            iconSize: [26, 26],
            iconAnchor: [13, 13],
          }),
        }).addTo(grupo);
      }
    };
    dibujar();
    m.on("zoomend", dibujar);
    return () => {
      m.off("zoomend", dibujar);
    };
  }, [verNumeros]);

  /* ------------------------------------------------------------- marcadores */
  useEffect(() => {
    const grupo = capaMarcadores.current;
    if (!grupo) return;
    grupo.clearLayers();
    for (const mk of marcadores) {
      L.marker(mk.latlng as L.LatLngExpression, {
        icon: L.divIcon({
          className: mk.tipo === "yo" ? "marca-yo" : "marca-reunion",
          html: mk.tipo === "yo" ? "" : "<span>★</span>",
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
        title: mk.titulo,
      })
        .bindTooltip(mk.titulo)
        .addTo(grupo);
    }
  }, [marcadores]);

  /* ------------------------------------------------------- vértices editables */
  useEffect(() => {
    const grupo = capaVertices.current;
    if (!grupo) return;
    grupo.clearLayers();
    if (!editando) return;
    const v = vistas.find((x) => x.cuadra.id === editando);
    const poligono = poligonos.current.get(editando);
    if (!v || !poligono) return;

    // El anillo guardado viene cerrado (primer punto repetido al final); se
    // edita "abierto" (sin el duplicado) para no tener dos marcadores atados
    // al mismo vértice, y se vuelve a cerrar solo al guardar/dibujar.
    const cerrado = v.cuadra.latlng;
    const mismoPunto = (a: LatLng, b: LatLng) => a[0] === b[0] && a[1] === b[1];
    let anillo =
      cerrado.length > 1 && mismoPunto(cerrado[0], cerrado[cerrado.length - 1])
        ? cerrado.slice(0, -1)
        : cerrado.slice();

    const redibujar = () => {
      const cerrar = [...anillo, anillo[0]];
      poligono.setLatLngs(cerrar as L.LatLngExpression[]);
      grupo.clearLayers();

      anillo.forEach((punto, i) => {
        let arrastrando = false;
        const marcador = L.marker(punto as L.LatLngExpression, {
          draggable: true,
          icon: L.divIcon({ className: "vertice-editor", iconSize: [16, 16], iconAnchor: [8, 8] }),
        });
        marcador.on("dragstart", () => {
          arrastrando = true;
        });
        marcador.on("drag", (e) => {
          const p = (e.target as L.Marker).getLatLng();
          anillo[i] = [p.lat, p.lng];
          poligono.setLatLngs([...anillo, anillo[0]] as L.LatLngExpression[]);
        });
        marcador.on("dragend", (e) => {
          const p = (e.target as L.Marker).getLatLng();
          anillo[i] = [p.lat, p.lng];
          alEditarVertices.current?.(editando, [...anillo, anillo[0]]);
        });
        marcador.on("click", () => {
          if (arrastrando) {
            arrastrando = false;
            return;
          }
          if (anillo.length <= 3) return; // un polígono necesita al menos 3 vértices
          anillo = anillo.filter((_, j) => j !== i);
          alEditarVertices.current?.(editando, [...anillo, anillo[0]]);
          redibujar();
        });
        marcador.addTo(grupo);
      });

      // Puntos medios: un clic inserta un vértice nuevo ahí.
      for (let i = 0; i < anillo.length; i++) {
        const a = anillo[i];
        const b = anillo[(i + 1) % anillo.length];
        const medio: LatLng = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const marcadorMedio = L.marker(medio as L.LatLngExpression, {
          icon: L.divIcon({ className: "vertice-medio", iconSize: [10, 10], iconAnchor: [5, 5] }),
        });
        marcadorMedio.on("click", () => {
          anillo = [...anillo.slice(0, i + 1), medio, ...anillo.slice(i + 1)];
          alEditarVertices.current?.(editando, [...anillo, anillo[0]]);
          redibujar();
        });
        marcadorMedio.addTo(grupo);
      }
    };

    redibujar();
  }, [editando, vistas]);

  /* ----------------------------------------------------------- clic general */
  useEffect(() => {
    const m = mapa.current;
    if (!m || !onClicMapa) return;
    const fn = (e: L.LeafletMouseEvent) => onClicMapa([e.latlng.lat, e.latlng.lng]);
    m.on("click", fn);
    return () => {
      m.off("click", fn);
    };
  }, [onClicMapa]);

  /* -------------------------------------------------------------- encuadres */
  useEffect(() => {
    const m = mapa.current;
    if (!m || !centrarEn || centrarEn.length === 0) return;
    m.fitBounds(L.latLngBounds(centrarEn as L.LatLngExpression[]).pad(0.35), { maxZoom: 18 });
  }, [centrarEn]);

  return <div ref={contenedor} className="mapa-real" />;
}

/** Encuadra todo el territorio otra vez. */
export function useReencuadre() {
  return GEO.limites;
}
