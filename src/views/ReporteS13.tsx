import { useMemo, useState } from "react";
import { Vacio } from "../components/ui";
import { BLOQUES_S13, anioServicioDe, construirS13, fechaS13 } from "../domain/s13";
import { hoy } from "../domain/fechas";
import { useApp } from "../hooks/useApp";

/**
 * Réplica del formato oficial «S-13 · Registro de asignación de territorio».
 *
 * Se imprime tal cual se llena a mano: por territorio, la última fecha en que se
 * completó y cuatro bloques de «asignado a / fecha en que se asignó / fecha en
 * que se completó». Los rangos por hoja replican el uso actual (1-20 y 21-39).
 */

const RANGOS = [
  { nombre: "1 a 20", desde: 1, hasta: 20 },
  { nombre: "21 a 39", desde: 21, hasta: 39 },
  { nombre: "Todos", desde: 1, hasta: 9999 },
];

export function ReporteS13() {
  const { db } = useApp();
  const [anio, setAnio] = useState(anioServicioDe(hoy()));
  const [rango, setRango] = useState(0);

  const anios = useMemo(() => {
    const s = new Set(db.asignaciones.map((a) => a.anioServicio));
    s.add(anioServicioDe(hoy()));
    return [...s].sort((a, b) => b - a);
  }, [db.asignaciones]);

  const r = RANGOS[rango];
  const renglones = useMemo(
    () => construirS13(db, anio, r.desde, r.hasta),
    [db, anio, r.desde, r.hasta],
  );

  const conMovimiento = renglones.filter((x) => x.bloques.length > 0).length;

  return (
    <>
      <div className="fila entre no-imprimir">
        <div>
          <h2>Registro de asignación de territorio (S-13)</h2>
          <p className="chico suave" style={{ margin: 0 }}>
            {conMovimiento} de {renglones.length} territorios con movimiento en el año de servicio {anio}.
          </p>
        </div>
        <div className="fila">
          <label className="fila chico suave" style={{ gap: 6 }}>
            Año de servicio
            <select className="btn chico" value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
              {anios.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label className="fila chico suave" style={{ gap: 6 }}>
            Hoja
            <select className="btn chico" value={rango} onChange={(e) => setRango(Number(e.target.value))}>
              {RANGOS.map((x, i) => <option key={x.nombre} value={i}>{x.nombre}</option>)}
            </select>
          </label>
          <button className="btn primario" onClick={() => window.print()}>Imprimir</button>
        </div>
      </div>

      <p className="chico suave no-imprimir" style={{ margin: 0 }}>
        Se imprime en A4 vertical, igual que el formato en papel. Desde el diálogo de impresión
        puedes guardarlo como PDF.
      </p>

      {renglones.length === 0 ? (
        <Vacio>No hay territorios en este rango.</Vacio>
      ) : (
        <div className="hoja-s13">
          <h3 className="s13-titulo">REGISTRO DE ASIGNACIÓN DE TERRITORIO</h3>
          <div className="s13-anio">
            <span>Año de servicio:</span>
            <strong>{anio}</strong>
          </div>

          <table className="s13">
            <thead>
              <tr>
                <th rowSpan={2} className="s13-num">Núm. de terr.</th>
                <th rowSpan={2} className="s13-ultima">Última fecha en que se completó*</th>
                <th colSpan={BLOQUES_S13 * 2}>Asignado a</th>
              </tr>
              <tr>
                {Array.from({ length: BLOQUES_S13 }, (_, i) => [
                  <th key={`a${i}`}>Fecha en que se asignó</th>,
                  <th key={`c${i}`}>Fecha en que se completó</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {renglones.map((f) => (
                <>
                  <tr key={`n-${f.territorio.id}`} className="s13-nombres">
                    <td rowSpan={2} className="s13-num">{f.territorio.id}</td>
                    <td rowSpan={2} className="s13-ultima mono">{fechaS13(f.ultimaVezCompletado)}</td>
                    {Array.from({ length: BLOQUES_S13 }, (_, i) => (
                      <td key={i} colSpan={2} className="s13-persona">
                        {f.bloques[i]?.persona?.nombre ?? ""}
                      </td>
                    ))}
                  </tr>
                  <tr key={`f-${f.territorio.id}`} className="s13-fechas">
                    {Array.from({ length: BLOQUES_S13 }, (_, i) => [
                      <td key={`a${i}`} className="mono">
                        {fechaS13(f.bloques[i]?.asignacion.fechaAsignacion)}
                      </td>,
                      <td key={`c${i}`} className="mono">
                        {fechaS13(f.bloques[i]?.asignacion.fechaCompletado)}
                      </td>,
                    ])}
                  </tr>
                </>
              ))}
            </tbody>
          </table>

          <p className="s13-nota">
            *Cuando comience una nueva página, anote en esta columna la última fecha en que los
            territorios se completaron.
          </p>
          <p className="s13-pie">S-13-S</p>
        </div>
      )}

      {renglones.some((x) => x.excedente > 0) && (
        <div className="tarjeta chico no-imprimir" style={{ borderColor: "#fcd34d", background: "#fffbeb" }}>
          <strong>Hay territorios con más de {BLOQUES_S13} asignaciones este año</strong>
          <p style={{ margin: "6px 0 0" }}>
            La hoja oficial solo tiene {BLOQUES_S13} bloques, así que se muestran los primeros. En
            papel esto se resuelve empezando una hoja nueva:{" "}
            {renglones.filter((x) => x.excedente > 0).map((x) => `T${x.territorio.id} (+${x.excedente})`).join(", ")}.
          </p>
        </div>
      )}
    </>
  );
}
