/**
 * Gráficas en SVG puro, sin dependencias.
 *
 * Reglas que se respetan en todas: una sola escala por eje, marcas delgadas
 * (≤24px) con extremo redondeado de 4px sobre la línea base, rejilla en
 * hairline, separación por hueco de 2px del color de fondo (nunca por contorno),
 * etiquetas selectivas y texto siempre en tinta, nunca en el color de la serie.
 */

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

export const PALETA = {
  serie: "#2a78d6",
  serieSuave: "#cde2fb",
  bueno: "#00843d",
  aviso: "#c07800",
  critico: "#d03b3b",
  nunca: "#4a3aa7",
  tinta: "#0f172a",
  tintaSuave: "#52514e",
  apagado: "#898781",
  rejilla: "#e1e0d9",
  base: "#c3c2b7",
  superficie: "#ffffff",
};

/** Ancho real del contenedor, para dibujar en píxeles y no deformar el texto. */
export function useAncho<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [ancho, setAncho] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAncho(e.contentRect.width));
    ro.observe(el);
    setAncho(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, ancho] as const;
}

function Tooltip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: "translate(-50%, -110%)",
        background: PALETA.tinta,
        color: "#fff",
        padding: "5px 9px",
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 600,
        pointerEvents: "none",
        whiteSpace: "nowrap",
        zIndex: 4,
      }}
    >
      {children}
    </div>
  );
}

/** Rectángulo con las dos esquinas del extremo redondeadas (4px). */
function barraH(x: number, y: number, w: number, h: number, r = 4) {
  const rr = Math.max(0, Math.min(r, w, h / 2));
  return `M${x} ${y}h${Math.max(0, w - rr)}a${rr} ${rr} 0 0 1 ${rr} ${rr}v${h - rr * 2}a${rr} ${rr} 0 0 1 ${-rr} ${rr}H${x}z`;
}

function barraV(x: number, y: number, w: number, h: number, r = 4) {
  const rr = Math.max(0, Math.min(r, h, w / 2));
  return `M${x} ${y + h}V${y + rr}a${rr} ${rr} 0 0 1 ${rr} ${-rr}h${w - rr * 2}a${rr} ${rr} 0 0 1 ${rr} ${rr}V${y + h}z`;
}

export interface Dato {
  clave: string;
  etiqueta: string;
  valor: number;
  /** Texto secundario que acompaña a la fila. */
  detalle?: string;
  color?: string;
}

/** Comparación de magnitud entre categorías con nombre largo. */
export function BarrasHorizontales({
  datos, formato = (n: number) => String(n), anchoEtiqueta = 130, alturaFila = 30, max,
}: {
  datos: Dato[];
  formato?: (n: number) => string;
  anchoEtiqueta?: number;
  alturaFila?: number;
  max?: number;
}) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const [encima, setEncima] = useState<number | null>(null);

  if (!datos.length) return <p className="chico suave">Sin datos todavía.</p>;

  const alto = datos.length * alturaFila + 6;
  const etiquetaAncho = ancho < 420 ? 96 : anchoEtiqueta;
  const margenDerecho = 52;
  const anchoTrazo = Math.max(40, ancho - etiquetaAncho - margenDerecho);
  const tope = max ?? Math.max(...datos.map((d) => d.valor), 1);
  const grosor = Math.min(20, alturaFila - 10);

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      {ancho > 0 && (
        <svg width={ancho} height={alto} role="img">
          {datos.map((d, i) => {
            const y = i * alturaFila + 3;
            const w = tope > 0 ? (d.valor / tope) * anchoTrazo : 0;
            const activo = encima === i;
            return (
              <g
                key={d.clave}
                onMouseEnter={() => setEncima(i)}
                onMouseLeave={() => setEncima(null)}
              >
                <rect x={0} y={y} width={ancho} height={alturaFila - 2} fill="transparent" />
                <text
                  x={0}
                  y={y + grosor / 2 + alturaFila / 2 - grosor / 2 + 1}
                  fontSize={12}
                  fill={PALETA.tintaSuave}
                  dominantBaseline="middle"
                >
                  {d.etiqueta.length > (ancho < 420 ? 13 : 20)
                    ? `${d.etiqueta.slice(0, ancho < 420 ? 12 : 19)}…`
                    : d.etiqueta}
                </text>
                <rect
                  x={etiquetaAncho}
                  y={y + (alturaFila - 2 - grosor) / 2}
                  width={anchoTrazo}
                  height={grosor}
                  rx={4}
                  fill={PALETA.serieSuave}
                  opacity={0.45}
                />
                <path
                  d={barraH(etiquetaAncho, y + (alturaFila - 2 - grosor) / 2, w, grosor)}
                  fill={d.color ?? PALETA.serie}
                  opacity={activo ? 0.85 : 1}
                />
                <text
                  x={etiquetaAncho + anchoTrazo + 8}
                  y={y + (alturaFila - 2) / 2}
                  fontSize={12}
                  fill={PALETA.tinta}
                  dominantBaseline="middle"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {formato(d.valor)}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {encima !== null && datos[encima].detalle && (
        <Tooltip x={ancho / 2} y={encima * alturaFila + 6}>
          {datos[encima].etiqueta}: {datos[encima].detalle}
        </Tooltip>
      )}
    </div>
  );
}

/** Serie temporal corta: una columna por periodo, una sola escala. */
export function Columnas({
  datos, alto = 190, meta, formato = (n: number) => String(n),
}: {
  datos: Dato[];
  alto?: number;
  meta?: number;
  formato?: (n: number) => string;
}) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const [encima, setEncima] = useState<number | null>(null);

  if (!datos.length) return <p className="chico suave">Sin datos todavía.</p>;

  const margen = { arriba: 18, abajo: 26, izq: 30, der: 6 };
  const anchoTrazo = Math.max(40, ancho - margen.izq - margen.der);
  const altoTrazo = alto - margen.arriba - margen.abajo;
  const tope = Math.max(...datos.map((d) => d.valor), meta ?? 0, 1);
  const paso = anchoTrazo / datos.length;
  const grosor = Math.min(24, paso - 6);
  const escalaY = (v: number) => margen.arriba + altoTrazo - (v / tope) * altoTrazo;

  const ticks = [0, tope / 2, tope].map((v) => Math.round(v));

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      {ancho > 0 && (
        <svg width={ancho} height={alto} role="img">
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={margen.izq} x2={margen.izq + anchoTrazo}
                y1={escalaY(t)} y2={escalaY(t)}
                stroke={t === 0 ? PALETA.base : PALETA.rejilla} strokeWidth={1}
              />
              <text
                x={margen.izq - 6} y={escalaY(t)} fontSize={11} fill={PALETA.apagado}
                textAnchor="end" dominantBaseline="middle"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {t}
              </text>
            </g>
          ))}

          {meta !== undefined && meta > 0 && (
            <line
              x1={margen.izq} x2={margen.izq + anchoTrazo}
              y1={escalaY(meta)} y2={escalaY(meta)}
              stroke={PALETA.aviso} strokeWidth={1.5} strokeDasharray="4 3"
            />
          )}

          {datos.map((d, i) => {
            const x = margen.izq + i * paso + (paso - grosor) / 2;
            const y = escalaY(d.valor);
            const h = margen.arriba + altoTrazo - y;
            const ultimo = i === datos.length - 1;
            return (
              <g
                key={d.clave}
                onMouseEnter={() => setEncima(i)}
                onMouseLeave={() => setEncima(null)}
              >
                <rect x={margen.izq + i * paso} y={margen.arriba} width={paso} height={altoTrazo} fill="transparent" />
                {h > 0 && (
                  <path d={barraV(x, y, grosor, h)} fill={ultimo ? PALETA.serie : PALETA.serieSuave} />
                )}
                {ultimo && d.valor > 0 && (
                  <text
                    x={x + grosor / 2} y={y - 5} fontSize={11} fill={PALETA.tinta}
                    textAnchor="middle" fontWeight={700}
                  >
                    {formato(d.valor)}
                  </text>
                )}
                {(i % Math.ceil(datos.length / 6) === 0 || ultimo) && (
                  <text
                    x={x + grosor / 2} y={alto - 8} fontSize={10.5} fill={PALETA.apagado}
                    textAnchor="middle"
                  >
                    {d.etiqueta}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {encima !== null && (
        <Tooltip x={margen.izq + (encima + 0.5) * (Math.max(40, ancho - margen.izq - margen.der) / datos.length)} y={20}>
          {datos[encima].detalle ?? `${datos[encima].etiqueta}: ${formato(datos[encima].valor)}`}
        </Tooltip>
      )}
    </div>
  );
}

/** Parte-todo en una sola barra: los huecos de 2px separan los segmentos. */
export function BarraApilada({ datos, alto = 30 }: { datos: Dato[]; alto?: number }) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const total = datos.reduce((s, d) => s + d.valor, 0);
  if (!total) return <p className="chico suave">Sin datos todavía.</p>;

  let x = 0;
  const hueco = 2;
  return (
    <div ref={ref} style={{ width: "100%" }}>
      {ancho > 0 && (
        <svg width={ancho} height={alto} role="img">
          {datos.map((d, i) => {
            const w = Math.max(0, (d.valor / total) * ancho - (i < datos.length - 1 ? hueco : 0));
            const propio = x;
            x += w + hueco;
            const cabe = w > 34;
            return (
              <g key={d.clave}>
                <rect
                  x={propio} y={0} width={w} height={alto}
                  rx={i === 0 || i === datos.length - 1 ? 4 : 0}
                  fill={d.color ?? PALETA.serie}
                />
                {cabe && (
                  <text
                    x={propio + w / 2} y={alto / 2} fontSize={11.5} fontWeight={700}
                    fill="#fff" textAnchor="middle" dominantBaseline="middle"
                  >
                    {d.valor}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

export function Leyenda({ datos }: { datos: Dato[] }) {
  return (
    <div className="fila chico" style={{ gap: 12, marginTop: 8 }}>
      {datos.map((d) => (
        <span key={d.clave} className="fila" style={{ gap: 5 }}>
          <i style={{ width: 10, height: 10, borderRadius: 3, background: d.color ?? PALETA.serie }} />
          <span className="suave">{d.etiqueta}</span>
        </span>
      ))}
    </div>
  );
}
