import { useCallback, useMemo, useState } from "react";
import { CAPAS, MapaReal } from "../components/MapaReal";
import type { CapaFondo } from "../components/MapaReal";
import { PALETA } from "../components/graficas";
import { BarraAvance, Chip, confirmar } from "../components/ui";
import { compartirTexto, textoAnuncio } from "../domain/anuncio";
import { GEO, areaTexto, enlaceRuta } from "../domain/mapa";
import { fechaCorta, haceTexto, hoy } from "../domain/fechas";
import type { VistaCuadra } from "../domain/estado";
import type { LatLng } from "../domain/tipos";
import { useApp } from "../hooks/useApp";

type ModoColor = "estado" | "antiguedad" | "territorio";
type ModoToque = "marcar" | "consultar" | "seleccionar";

// Misma paleta validada que las gráficas (daltonismo y contraste sobre blanco).
const COLOR_ESTADO: Record<string, string> = {
  trabajada: PALETA.bueno,
  pendiente: "#94a3b8",
  inactiva: "#d8d6d0",
};

const COLOR_ANTIGUEDAD: Record<string, string> = {
  reciente: PALETA.bueno,
  medio: PALETA.aviso,
  viejo: PALETA.critico,
  nunca: PALETA.nunca,
};

const TOQUES: { clave: ModoToque; nombre: string; ayuda: string }[] = [
  { clave: "marcar", nombre: "Marcar", ayuda: "Toca una cuadra para marcarla trabajada hoy. Vuelve a tocarla para deshacer." },
  { clave: "consultar", nombre: "Consultar", ayuda: "Toca una cuadra para ver su historial y sus notas." },
  { clave: "seleccionar", nombre: "Seleccionar", ayuda: "Toca varias cuadras para marcarlas o anunciarlas juntas." },
];

export function VistaMapa() {
  const { db, indice, acciones } = useApp();
  const [modo, setModo] = useState<ModoColor>("estado");
  const [toque, setToque] = useState<ModoToque>("marcar");
  const [capa, setCapa] = useState<CapaFondo>("calles");
  const [zona, setZona] = useState("");
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [detalle, setDetalle] = useState<string | null>(null);
  const [miUbicacion, setMiUbicacion] = useState<LatLng | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [centrarEn, setCentrarEn] = useState<LatLng[] | null>(null);

  const zonas = useMemo(
    () => [...new Set(db.territorios.map((t) => t.zona))].sort((a, b) => a.localeCompare(b, "es")),
    [db.territorios],
  );

  const foco = useMemo(
    () => (zona ? new Set(db.territorios.filter((t) => t.zona === zona).map((t) => t.id)) : null),
    [zona, db.territorios],
  );

  const color = useCallback(
    (v: VistaCuadra) => {
      if (modo === "territorio") return v.territorio.color;
      if (modo === "antiguedad") return COLOR_ANTIGUEDAD[v.antiguedad];
      return COLOR_ESTADO[v.estado];
    },
    [modo],
  );

  /** Capitán de la jornada de hoy, para que el registro quede con nombre. */
  const capitanDeHoy = useMemo(() => {
    const j = db.jornadas.find((x) => x.fecha === hoy() && x.capitanId);
    return j?.capitanId ?? undefined;
  }, [db.jornadas]);

  const marcarAlternando = useCallback(
    (v: VistaCuadra) => {
      const deHoy = v.historial.find((r) => r.fecha === hoy());
      if (deHoy) {
        acciones.eliminarRegistro(deHoy.id);
        setAviso(`${v.cuadra.id}: registro de hoy deshecho`);
      } else {
        acciones.registrarTrabajo([v.cuadra.id], { fecha: hoy(), capitanId: capitanDeHoy });
        setAviso(`${v.cuadra.id} marcada como trabajada hoy`);
      }
      window.setTimeout(() => setAviso(null), 2200);
    },
    [acciones, capitanDeHoy],
  );

  const alTocar = useCallback(
    (v: VistaCuadra) => {
      if (toque === "marcar") return marcarAlternando(v);
      if (toque === "consultar") return setDetalle(v.cuadra.id);
      setSeleccion((prev) => {
        const s = new Set(prev);
        if (s.has(v.cuadra.id)) s.delete(v.cuadra.id);
        else s.add(v.cuadra.id);
        return s;
      });
    },
    [toque, marcarAlternando],
  );

  const elegidas = [...seleccion]
    .map((id) => indice.cuadras.get(id))
    .filter((v): v is VistaCuadra => Boolean(v));

  const vistaDetalle = detalle ? indice.cuadras.get(detalle) ?? null : null;

  const marcadores = useMemo(() => {
    const lista: { latlng: LatLng; titulo: string; tipo: "reunion" | "yo" }[] = db.puntosReunion
      .filter((p) => p.activo && p.ubicacion)
      .map((p) => ({ latlng: p.ubicacion!, titulo: `Punto de reunión: ${p.nombre}`, tipo: "reunion" }));
    if (miUbicacion) lista.push({ latlng: miUbicacion, titulo: "Estoy aquí", tipo: "yo" });
    return lista;
  }, [db.puntosReunion, miUbicacion]);

  const ubicarme = () => {
    if (!navigator.geolocation) {
      setAviso("Este dispositivo no comparte ubicación.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p: LatLng = [pos.coords.latitude, pos.coords.longitude];
        setMiUbicacion(p);
        setCentrarEn([p]);
      },
      () => setAviso("No se pudo obtener la ubicación. Revisa los permisos."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div className="mapa-pantalla">
      <MapaReal
        vistas={indice.todas}
        color={color}
        seleccion={toque === "seleccionar" ? seleccion : undefined}
        onCuadra={alTocar}
        foco={foco}
        capa={capa}
        marcadores={marcadores}
        centrarEn={centrarEn}
      />

      <div className="mapa-superior no-imprimir">
        <div className="segmentado" role="group" aria-label="Qué hace tocar el mapa">
          {TOQUES.map((t) => (
            <button
              key={t.clave}
              type="button"
              aria-pressed={toque === t.clave}
              onClick={() => {
                setToque(t.clave);
                if (t.clave !== "seleccionar") setSeleccion(new Set());
                if (t.clave !== "consultar") setDetalle(null);
              }}
            >
              {t.nombre}
            </button>
          ))}
        </div>
        <div className="fila" style={{ gap: 6 }}>
          <select className="btn chico" value={modo} onChange={(e) => setModo(e.target.value as ModoColor)} aria-label="Cómo colorear">
            <option value="estado">Estado</option>
            <option value="antiguedad">Antigüedad</option>
            <option value="territorio">Territorios</option>
          </select>
          <select className="btn chico" value={capa} onChange={(e) => setCapa(e.target.value as CapaFondo)} aria-label="Fondo del mapa">
            {CAPAS.map((c) => (
              <option key={c.clave} value={c.clave}>{c.nombre}</option>
            ))}
          </select>
          <select className="btn chico" value={zona} onChange={(e) => setZona(e.target.value)} aria-label="Filtrar por zona">
            <option value="">Todas las zonas</option>
            {zonas.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
          <button className="btn chico" onClick={ubicarme} title="Centrar en mi ubicación">◎ Dónde estoy</button>
          <button className="btn chico" onClick={() => setCentrarEn([GEO.limites[0], GEO.limites[1]])} title="Ver todo el territorio">⤢</button>
        </div>
        <p className="ayuda-toque">{TOQUES.find((t) => t.clave === toque)?.ayuda}</p>
      </div>

      <div className="mapa-leyenda no-imprimir">
        {modo === "territorio" ? (
          <div className="fila-leyenda suave">Color original del mapa</div>
        ) : modo === "antiguedad" ? (
          <>
            <div className="fila-leyenda"><i style={{ background: COLOR_ANTIGUEDAD.reciente }} /> Hasta {db.config.umbralReciente} días</div>
            <div className="fila-leyenda"><i style={{ background: COLOR_ANTIGUEDAD.medio }} /> Hasta {db.config.umbralMedio} días</div>
            <div className="fila-leyenda"><i style={{ background: COLOR_ANTIGUEDAD.viejo }} /> Más de {db.config.umbralMedio} días</div>
            <div className="fila-leyenda"><i style={{ background: COLOR_ANTIGUEDAD.nunca }} /> Nunca registrada</div>
          </>
        ) : (
          <>
            <div className="fila-leyenda"><i style={{ background: COLOR_ESTADO.trabajada }} /> Trabajada</div>
            <div className="fila-leyenda"><i style={{ background: COLOR_ESTADO.pendiente }} /> Pendiente</div>
          </>
        )}
        <div className="fila-leyenda"><i style={{ background: "transparent", border: "2px solid #d03b3b", borderRadius: 2 }} /> Límite del territorio</div>
      </div>

      {aviso && <div className="brindis no-imprimir">{aviso}</div>}

      {elegidas.length > 0 && (
        <aside className="panel-lateral">
          <header>
            <h3 className="crece">{elegidas.length} cuadras seleccionadas</h3>
            <button className="btn fantasma" onClick={() => setSeleccion(new Set())} aria-label="Cerrar">✕</button>
          </header>
          <div className="cuerpo">
            <div className="lista-seleccion">
              {elegidas.map((v) => (
                <button key={v.cuadra.id} className="ficha" aria-pressed onClick={() => alTocar(v)}>
                  <i className="color" style={{ background: v.territorio.color }} />
                  {v.cuadra.id} ✕
                </button>
              ))}
            </div>
            <p className="chico suave">
              Superficie: {areaTexto(elegidas.reduce((s, v) => s + v.cuadra.areaM2, 0))}
            </p>
          </div>
          <footer>
            <button
              className="btn primario crece"
              onClick={() => {
                acciones.registrarTrabajo(elegidas.map((v) => v.cuadra.id), { fecha: hoy(), capitanId: capitanDeHoy });
                setSeleccion(new Set());
              }}
            >
              Marcar trabajadas hoy
            </button>
            <button
              className="btn"
              onClick={() => void compartirTexto(textoAnuncio(hoy(), "Territorio", elegidas))}
            >
              Anunciar
            </button>
          </footer>
        </aside>
      )}

      {vistaDetalle && (
        <aside className="panel-lateral">
          <header>
            <h3 className="crece">{vistaDetalle.territorio.nombre} · {vistaDetalle.cuadra.letra}</h3>
            <button className="btn fantasma" onClick={() => setDetalle(null)} aria-label="Cerrar">✕</button>
          </header>
          <div className="cuerpo">
            <Detalle v={vistaDetalle} />
          </div>
          <footer>
            <button className="btn primario crece" onClick={() => marcarAlternando(vistaDetalle)}>
              {vistaDetalle.historial.some((r) => r.fecha === hoy()) ? "Deshacer registro de hoy" : "Marcar trabajada hoy"}
            </button>
            <a
              className="btn"
              href={enlaceRuta(vistaDetalle.cuadra.centroLatLng)}
              target="_blank"
              rel="noreferrer"
              title="Abrir en la app de mapas"
            >
              Cómo llegar
            </a>
          </footer>
        </aside>
      )}
    </div>
  );
}

function Detalle({ v }: { v: VistaCuadra }) {
  const { db, resumenes, acciones } = useApp();
  const capitan = (id?: string) => db.personas.find((c) => c.id === id)?.nombre ?? "sin capitán";
  const resumen = resumenes.find((r) => r.territorio.id === v.territorio.id);

  return (
    <>
      <div className="fila">
        <Chip color={v.territorio.color}>{v.territorio.zona}</Chip>
        <Chip>{areaTexto(v.cuadra.areaM2)}</Chip>
        {v.estado === "trabajada" && <Chip color={PALETA.bueno}>Trabajada</Chip>}
        {v.estado === "pendiente" && <Chip color="#94a3b8">Pendiente</Chip>}
        {v.estado === "inactiva" && <Chip>Fuera de servicio</Chip>}
      </div>

      <div className="tarjeta">
        <div className="fila entre">
          <span className="chico suave">Último trabajo</span>
          <strong className="chico">{haceTexto(v.diasDesde)}</strong>
        </div>
        {v.ultimo && (
          <p className="chico suave" style={{ margin: "6px 0 0" }}>
            {fechaCorta(v.ultimo.fecha)} · {capitan(v.ultimo.capitanId)}
          </p>
        )}
      </div>

      {resumen && (
        <div className="tarjeta">
          <div className="fila entre">
            <strong className="chico">{resumen.territorio.nombre}</strong>
            <span className="chico suave mono">{resumen.trabajadas}/{resumen.total}</span>
          </div>
          <div style={{ margin: "8px 0" }}>
            <BarraAvance valor={resumen.avance} />
          </div>
          <button
            className="btn chico"
            onClick={() => {
              const pendientes = (db.territorios.find((t) => t.id === v.territorio.id)?.cuadras ?? [])
                .filter((c) => c.activa)
                .map((c) => c.id);
              if (confirmar(`¿Marcar las ${pendientes.length} cuadras de ${v.territorio.nombre} como trabajadas hoy?`)) {
                acciones.registrarTrabajo(pendientes, { fecha: hoy() });
              }
            }}
          >
            Marcar todo el territorio
          </button>
        </div>
      )}

      <div>
        <h4 className="chico suave" style={{ marginBottom: 6 }}>Historial ({v.historial.length})</h4>
        {v.historial.length === 0 ? (
          <p className="chico suave">Sin registros todavía.</p>
        ) : (
          <table className="tabla">
            <tbody>
              {v.historial.slice(0, 12).map((r) => (
                <tr key={r.id}>
                  <td className="mono">{fechaCorta(r.fecha)}</td>
                  <td className="suave">{capitan(r.capitanId)}</td>
                  <td style={{ width: 34 }}>
                    <button
                      className="btn fantasma chico"
                      title="Eliminar este registro"
                      onClick={() => {
                        if (confirmar("¿Eliminar este registro de la bitácora?")) acciones.eliminarRegistro(r.id);
                      }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <label className="campo">
        Notas de la cuadra
        <textarea
          value={v.cuadra.notas ?? ""}
          placeholder="Perros, portones, horarios, casas no visitar…"
          onChange={(e) => acciones.guardarCuadra(v.territorio.id, v.cuadra.id, { notas: e.target.value })}
        />
      </label>

      <label className="fila chico">
        <input
          type="checkbox"
          checked={v.cuadra.activa}
          onChange={(e) => acciones.guardarCuadra(v.territorio.id, v.cuadra.id, { activa: e.target.checked })}
        />
        Cuadra en servicio
      </label>
    </>
  );
}
