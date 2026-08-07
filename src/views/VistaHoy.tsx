import { useMemo, useState } from "react";
import { MapaReal } from "../components/MapaReal";
import { PALETA } from "../components/graficas";
import { Vacio } from "../components/ui";
import { compartirTexto, textoAnuncio } from "../domain/anuncio";
import { continuacion, distanciaA, ultimaSalida } from "../domain/estado";
import type { VistaCuadra } from "../domain/estado";
import { diasEntre, fechaLarga, haceTexto, hoy } from "../domain/fechas";
import { areaTexto } from "../domain/mapa";
import type { LatLng } from "../domain/tipos";
import { useApp } from "../hooks/useApp";

export function VistaHoy() {
  const { db, indice, acciones, global } = useApp();
  const [cuantas, setCuantas] = useState(8);
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());

  const ultima = useMemo(() => ultimaSalida(db, indice), [db, indice]);
  const sugeridas = useMemo(() => continuacion(db, indice, cuantas), [db, indice, cuantas]);
  const capitanesHoy = useMemo(
    () =>
      db.jornadas
        .filter((j) => j.fecha === hoy() && j.capitanId)
        .map((j) => ({
          modalidad: db.config.modalidades.find((m) => m.id === j.modalidadId)?.nombre ?? j.modalidadId,
          capitan: db.personas.find((p) => p.id === j.capitanId)?.nombre ?? "—",
          modalidadId: j.modalidadId,
        }))
        .sort((a, b) => a.modalidad.localeCompare(b.modalidad, "es")),
    [db.jornadas, db.config.modalidades, db.personas],
  );

  const alternar = (id: string) =>
    setElegidas((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  const seleccionadas = sugeridas.filter((v) => elegidas.has(v.cuadra.id));
  const aUsar = seleccionadas.length ? seleccionadas : sugeridas;

  // La bitácora puede tener trabajo de otros días (se marcó tarde o se puso al
  // corriente un atraso), así que "hoy" solo cuenta lo que de verdad es de hoy.
  const ultimaEsHoy = ultima?.fecha === hoy();
  const idsUltima = new Set(ultimaEsHoy ? ultima!.cuadras.map((v) => v.cuadra.id) : []);
  const idsSugeridas = new Set(sugeridas.map((v) => v.cuadra.id));

  const colorMini = (v: VistaCuadra) => {
    if (idsUltima.has(v.cuadra.id)) return PALETA.bueno;
    if (idsSugeridas.has(v.cuadra.id)) return PALETA.aviso;
    if (v.estado === "trabajada") return "#cfd8d3";
    return "#e6e4df";
  };

  const centro: LatLng[] = [
    ...(ultimaEsHoy ? ultima!.cuadras : []).map((v) => v.cuadra.centroLatLng),
    ...sugeridas.map((v) => v.cuadra.centroLatLng),
  ];

  return (
    <div className="rejilla" style={{ gap: 16 }}>
      <div className="fila entre">
        <div>
          <h2>Hoy · {fechaLarga(hoy())}</h2>
          <p className="chico suave" style={{ margin: 0 }}>
            {global.pendientes} cuadras pendientes de {global.totalCuadras} · {Math.round(global.avance * 100)}% del ciclo
          </p>
        </div>
      </div>

      {/* --------------------------------------------------- capitán del rol */}
      <section className="tarjeta">
        <h3>Capitán de hoy</h3>
        {capitanesHoy.length === 0 ? (
          <Vacio>Sin capitán asignado en el rol para hoy. Se puede definir en Rol mensual.</Vacio>
        ) : (
          <div className="rejilla" style={{ gap: 6, marginTop: 8 }}>
            {capitanesHoy.map((c) => (
              <div key={c.modalidadId} className="fila entre">
                <strong className="chico">{c.modalidad}</strong>
                <span className="chico suave">{c.capitan}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* --------------------------------------------------------- hoy mismo */}
      <section className="tarjeta">
        <h3>Trabajado hoy</h3>
        {!ultima ? (
          <Vacio>Todavía no hay trabajo registrado. La primera asignación puede ser cualquier territorio.</Vacio>
        ) : !ultimaEsHoy ? (
          <Vacio>
            Todavía no se ha marcado nada hoy. La última salida fue el {fechaLarga(ultima.fecha)} (
            {haceTexto(diasEntre(ultima.fecha))}).
          </Vacio>
        ) : (
          <>
            <p className="chico suave" style={{ margin: "4px 0 10px" }}>
              {ultima.cuadras.length} cuadras ·{" "}
              {ultima.capitanes
                .map((id) => db.personas.find((c) => c.id === id)?.nombre)
                .filter(Boolean)
                .join(", ") || "sin capitán registrado"}
            </p>
            <div className="lista-seleccion">
              {ultima.cuadras.map((v) => (
                <span key={v.cuadra.id} className="ficha">
                  <i className="color" style={{ background: PALETA.bueno }} />
                  {v.cuadra.id}
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      {/* -------------------------------------------------- continuación hoy */}
      <section className="tarjeta">
        <div className="fila entre">
          <h3>Continuación sugerida</h3>
          <label className="fila chico suave" style={{ gap: 6 }}>
            Cuántas
            <select
              className="btn chico"
              value={cuantas}
              onChange={(e) => {
                setCuantas(Number(e.target.value));
                setElegidas(new Set());
              }}
            >
              {[4, 6, 8, 10, 12, 16].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
        <p className="chico suave" style={{ margin: "2px 0 10px" }}>
          {ultima
            ? "Las cuadras pendientes más cercanas a donde terminaron, para no cruzar la colonia sin necesidad."
            : "Las cuadras que llevan más tiempo sin trabajarse."}
        </p>

        {sugeridas.length === 0 ? (
          <Vacio>No quedan cuadras pendientes en este ciclo.</Vacio>
        ) : (
          <>
            <div className="desplaza">
              <table className="tabla">
                <thead>
                  <tr>
                    <th style={{ width: 34 }} />
                    <th>Cuadra</th>
                    <th>Zona</th>
                    <th style={{ textAlign: "right" }}>Distancia</th>
                    <th style={{ textAlign: "right" }}>Superficie</th>
                    <th>Último trabajo</th>
                  </tr>
                </thead>
                <tbody>
                  {sugeridas.map((v) => {
                    const d = ultima ? distanciaA(v, ultima.cuadras) : null;
                    return (
                      <tr key={v.cuadra.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={elegidas.has(v.cuadra.id)}
                            onChange={() => alternar(v.cuadra.id)}
                            aria-label={`Elegir ${v.cuadra.id}`}
                          />
                        </td>
                        <td>
                          <span className="fila" style={{ gap: 6 }}>
                            <i style={{ width: 10, height: 10, borderRadius: 3, background: v.territorio.color }} />
                            <strong>{v.cuadra.id}</strong>
                          </span>
                        </td>
                        <td className="chico suave">{v.territorio.zona}</td>
                        <td className="mono chico" style={{ textAlign: "right" }}>
                          {d === null ? "—" : d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`}
                        </td>
                        <td className="mono chico suave" style={{ textAlign: "right" }}>
                          {areaTexto(v.cuadra.areaM2)}
                        </td>
                        <td className="chico suave">{haceTexto(v.diasDesde)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="fila" style={{ marginTop: 12 }}>
              <span className="chico suave crece">
                {seleccionadas.length
                  ? `${seleccionadas.length} elegidas`
                  : `Se usarán las ${sugeridas.length} sugeridas`}
              </span>
              <button
                className="btn"
                onClick={() => {
                  const modalidad = db.config.modalidades.find((m) => m.conTerritorio)?.nombre ?? "Territorio";
                  void compartirTexto(textoAnuncio(hoy(), modalidad, aUsar));
                }}
              >
                Anunciar
              </button>
              <button
                className="btn primario"
                onClick={() => {
                  const capitanId = db.jornadas.find((j) => j.fecha === hoy() && j.capitanId)?.capitanId ?? undefined;
                  acciones.registrarTrabajo(aUsar.map((v) => v.cuadra.id), { fecha: hoy(), capitanId });
                  setElegidas(new Set());
                }}
              >
                Marcar trabajadas hoy
              </button>
            </div>
          </>
        )}
      </section>

      {/* ------------------------------------------------------------ minimapa */}
      <section className="tarjeta" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ height: 340 }}>
          <MapaReal
            vistas={indice.todas}
            color={colorMini}
            capa="calles"
            verNumeros={false}
            centrarEn={centro.length ? centro : null}
          />
        </div>
        <div className="fila chico suave" style={{ padding: "8px 12px", gap: 14 }}>
          <span className="fila" style={{ gap: 5 }}>
            <i style={{ width: 10, height: 10, borderRadius: 3, background: PALETA.bueno }} /> Trabajado hoy
          </span>
          <span className="fila" style={{ gap: 5 }}>
            <i style={{ width: 10, height: 10, borderRadius: 3, background: PALETA.aviso }} /> Continuación sugerida
          </span>
        </div>
      </section>
    </div>
  );
}
