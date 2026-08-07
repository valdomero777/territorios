import { useCallback, useMemo, useState } from "react";
import { CAPAS, MapaReal } from "../components/MapaReal";
import type { CapaFondo } from "../components/MapaReal";
import { PALETA } from "../components/graficas";
import { BarraAvance, Chip, confirmar } from "../components/ui";
import { compartirTexto, textoAnuncio } from "../domain/anuncio";
import { GEO, areaTexto, enlaceRuta } from "../domain/mapa";
import { fechaCorta, fechaLarga, haceTexto, hoy } from "../domain/fechas";
import type { VistaCuadra } from "../domain/estado";
import type { Fecha, LatLng } from "../domain/tipos";
import { useApp } from "../hooks/useApp";

type ModoColor = "estado" | "antiguedad" | "territorio" | "fecha";
type ModoToque = "marcar" | "consultar" | "seleccionar" | "editarForma";

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
  { clave: "marcar", nombre: "Marcar", ayuda: "Toca una cuadra para marcarla trabajada en la fecha elegida abajo. Vuelve a tocarla para deshacer." },
  { clave: "consultar", nombre: "Consultar", ayuda: "Toca una cuadra para ver su historial y sus notas." },
  { clave: "seleccionar", nombre: "Seleccionar", ayuda: "Toca varias cuadras para marcarlas o anunciarlas juntas." },
  { clave: "editarForma", nombre: "Editar forma", ayuda: "Toca una cuadra y arrastra sus vértices para corregir su forma. Toca un vértice para quitarlo, o el punto de en medio de un lado para agregar uno." },
];

export function VistaMapa() {
  const { db, indice, acciones } = useApp();
  const [modo, setModo] = useState<ModoColor>("estado");
  const [toque, setToque] = useState<ModoToque>("marcar");
  const [capa, setCapa] = useState<CapaFondo>("calles");
  const [zona, setZona] = useState("");
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [detalle, setDetalle] = useState<string | null>(null);
  const [editandoForma, setEditandoForma] = useState<string | null>(null);
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

  /**
   * Fecha y encargado a los que se atribuye el registro al marcar. No siempre
   * es hoy: se olvida marcar y se pone al corriente después, así que hace
   * falta poder capturarlo con la fecha real en que se trabajó.
   */
  const [fecha, setFecha] = useState<Fecha>(hoy());
  const [capitanId, setCapitanId] = useState<string>("");

  const color = useCallback(
    (v: VistaCuadra) => {
      if (modo === "territorio") return v.territorio.color;
      if (modo === "antiguedad") return COLOR_ANTIGUEDAD[v.antiguedad];
      if (modo === "fecha") return v.historial.some((r) => r.fecha === fecha) ? PALETA.bueno : "#e6e4df";
      return COLOR_ESTADO[v.estado];
    },
    [modo, fecha],
  );

  /** Salidas del rol ese día: puede haber mañana y tarde, cada una con su encargado. */
  const jornadasDia = useMemo(
    () =>
      db.jornadas
        .filter((j) => j.fecha === fecha && j.capitanId)
        .map((j) => ({
          capitanId: j.capitanId!,
          etiqueta: `${db.config.modalidades.find((m) => m.id === j.modalidadId)?.nombre ?? j.modalidadId} — ${
            db.personas.find((p) => p.id === j.capitanId)?.nombre ?? "—"
          }`,
        })),
    [db.jornadas, db.config.modalidades, db.personas, fecha],
  );

  const otrasPersonas = useMemo(
    () =>
      db.personas
        .filter((p) => p.activo && !jornadasDia.some((j) => j.capitanId === p.id))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [db.personas, jornadasDia],
  );

  const elegirFecha = (nueva: Fecha) => {
    setFecha(nueva);
    const delDia = db.jornadas.filter((j) => j.fecha === nueva && j.capitanId);
    setCapitanId(delDia.length === 1 ? (delDia[0].capitanId ?? "") : "");
  };

  const cuadrasDeFecha = useMemo(
    () => indice.todas.filter((v) => v.historial.some((r) => r.fecha === fecha)),
    [indice, fecha],
  );

  const marcarAlternando = useCallback(
    (v: VistaCuadra) => {
      const deEseDia = v.historial.find((r) => r.fecha === fecha);
      if (deEseDia) {
        acciones.eliminarRegistro(deEseDia.id);
        setAviso(`${v.cuadra.id}: registro del ${fechaCorta(fecha)} deshecho`);
      } else {
        acciones.registrarTrabajo([v.cuadra.id], { fecha, capitanId: capitanId || undefined });
        setAviso(`${v.cuadra.id} marcada como trabajada el ${fechaCorta(fecha)}`);
      }
      window.setTimeout(() => setAviso(null), 2200);
    },
    [acciones, fecha, capitanId],
  );

  const alTocar = useCallback(
    (v: VistaCuadra) => {
      console.log("[diag] alTocar", v.cuadra.id, "toque:", toque);
      if (toque === "marcar") return marcarAlternando(v);
      if (toque === "consultar") return setDetalle(v.cuadra.id);
      if (toque === "editarForma") return setEditandoForma(v.cuadra.id);
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
  console.log("[diag] detalle:", detalle, "vistaDetalle:", vistaDetalle, "indice.cuadras.size:", indice.cuadras.size);
  const vistaEditando = editandoForma ? indice.cuadras.get(editandoForma) ?? null : null;

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
        editando={toque === "editarForma" ? editandoForma : null}
        onEditarVertices={(cuadraId, anillo) => acciones.guardarFormaCuadra(cuadraId, anillo)}
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
                if (t.clave !== "editarForma") setEditandoForma(null);
              }}
            >
              {t.nombre}
            </button>
          ))}
        </div>

        <div className="fila" style={{ gap: 6, flexWrap: "wrap" }}>
          <label className="fila chico suave" style={{ gap: 4 }}>
            Fecha
            <input
              type="date"
              className="btn chico"
              value={fecha}
              max={hoy()}
              onChange={(e) => elegirFecha(e.target.value)}
              aria-label="Fecha del registro"
            />
          </label>
          {(toque === "marcar" || toque === "seleccionar") && (
            <select
              className="btn chico"
              value={capitanId}
              onChange={(e) => setCapitanId(e.target.value)}
              aria-label="Encargado a cuyo nombre queda el registro"
            >
              <option value="">Sin encargado</option>
              {jornadasDia.length > 0 && (
                <optgroup label="Rol de ese día">
                  {jornadasDia.map((j) => (
                    <option key={j.capitanId} value={j.capitanId}>{j.etiqueta}</option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Otro hermano">
                {otrasPersonas.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </optgroup>
            </select>
          )}
          {fecha !== hoy() && (toque === "marcar" || toque === "seleccionar") && (
            <span className="chico" style={{ color: PALETA.aviso }}>
              Marcando para el {fechaLarga(fecha)}, no hoy
            </span>
          )}
        </div>

        <div className="fila" style={{ gap: 6 }}>
          <select className="btn chico" value={modo} onChange={(e) => setModo(e.target.value as ModoColor)} aria-label="Cómo colorear">
            <option value="estado">Estado</option>
            <option value="antiguedad">Antigüedad</option>
            <option value="territorio">Territorios</option>
            <option value="fecha">Por fecha</option>
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
        {modo === "fecha" && (
          <p className="chico suave" style={{ margin: "2px 0 0" }}>
            {cuadrasDeFecha.length} cuadras trabajadas el {fechaLarga(fecha)}
            {cuadrasDeFecha.length > 0 &&
              ` en ${new Set(cuadrasDeFecha.map((v) => v.territorio.id)).size} territorios`}
            .
          </p>
        )}
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
        ) : modo === "fecha" ? (
          <>
            <div className="fila-leyenda"><i style={{ background: PALETA.bueno }} /> Trabajada el {fechaCorta(fecha)}</div>
            <div className="fila-leyenda"><i style={{ background: "#e6e4df" }} /> No trabajada ese día</div>
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
                acciones.registrarTrabajo(elegidas.map((v) => v.cuadra.id), { fecha, capitanId: capitanId || undefined });
                setSeleccion(new Set());
              }}
            >
              Marcar trabajadas el {fechaCorta(fecha)}
            </button>
            <button
              className="btn"
              onClick={() => void compartirTexto(textoAnuncio(fecha, "Territorio", elegidas))}
            >
              Anunciar
            </button>
          </footer>
        </aside>
      )}

      {vistaEditando && (
        <aside className="panel-lateral">
          <header>
            <h3 className="crece">{vistaEditando.territorio.nombre} · {vistaEditando.cuadra.letra}</h3>
            <button className="btn fantasma" onClick={() => setEditandoForma(null)} aria-label="Cerrar">✕</button>
          </header>
          <div className="cuerpo">
            <p className="chico suave" style={{ margin: 0 }}>
              Arrastra los puntos rojos para corregir la forma. Toca un punto para quitarlo, o el punto tenue de
              en medio de un lado para agregar uno nuevo.
            </p>
            <p className="chico suave" style={{ margin: 0 }}>
              Superficie: <strong>{areaTexto(vistaEditando.cuadra.areaM2)}</strong>
              {db.geometriaEditada[vistaEditando.cuadra.id] && " · forma corregida"}
            </p>
          </div>
          <footer>
            <button
              className="btn peligro crece"
              disabled={!db.geometriaEditada[vistaEditando.cuadra.id]}
              onClick={() => {
                if (confirmar("¿Deshacer la forma corregida de esta cuadra y volver a la del mapa base?")) {
                  acciones.restablecerFormaCuadra(vistaEditando.cuadra.id);
                }
              }}
            >
              Deshacer forma
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
            <Detalle v={vistaDetalle} fecha={fecha} capitanId={capitanId} />
          </div>
          <footer>
            <button className="btn primario crece" onClick={() => marcarAlternando(vistaDetalle)}>
              {vistaDetalle.historial.some((r) => r.fecha === fecha)
                ? `Deshacer registro del ${fechaCorta(fecha)}`
                : `Marcar trabajada el ${fechaCorta(fecha)}`}
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

function Detalle({ v, fecha, capitanId }: { v: VistaCuadra; fecha: Fecha; capitanId: string }) {
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
              if (confirmar(`¿Marcar las ${pendientes.length} cuadras de ${v.territorio.nombre} como trabajadas el ${fechaCorta(fecha)}?`)) {
                acciones.registrarTrabajo(pendientes, { fecha, capitanId: capitanId || undefined });
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
