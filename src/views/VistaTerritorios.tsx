import { useMemo, useState } from "react";
import { Modal, Vacio, confirmar } from "../components/ui";
import { PALETA } from "../components/graficas";
import { ReporteS13 } from "./ReporteS13";
import { anioServicioDe, asignacionAbierta, asignacionesDe, fechaS13, ultimaVezCompletado } from "../domain/s13";
import { diasEntre, fechaCorta, haceTexto, hoy } from "../domain/fechas";
import type { AsignacionTerritorio, Territorio } from "../domain/tipos";
import { useApp } from "../hooks/useApp";

type Pestana = "asignaciones" | "reporte";

export function VistaTerritorios() {
  const [p, setP] = useState<Pestana>("asignaciones");
  return (
    <div className="rejilla" style={{ gap: 16 }}>
      <div className="fila no-imprimir">
        {([
          ["asignaciones", "Asignaciones"],
          ["reporte", "Registro S-13"],
        ] as const).map(([clave, nombre]) => (
          <button
            key={clave}
            className={`btn${p === clave ? " primario" : ""}`}
            onClick={() => setP(clave)}
          >
            {nombre}
          </button>
        ))}
      </div>
      {p === "asignaciones" ? <Asignaciones /> : <ReporteS13 />}
    </div>
  );
}

/* ---------------------------------------------------------- asignaciones */

function Asignaciones() {
  const { db, resumenes, acciones } = useApp();
  const [asignando, setAsignando] = useState<Territorio | null>(null);
  const [completando, setCompletando] = useState<AsignacionTerritorio | null>(null);
  const [editando, setEditando] = useState<AsignacionTerritorio | null>(null);
  const [filtro, setFiltro] = useState("");

  const persona = (id: string) => db.personas.find((x) => x.id === id);

  const filas = useMemo(
    () =>
      resumenes
        .map((r) => {
          const abierta = asignacionAbierta(db, r.territorio.id);
          return {
            resumen: r,
            abierta,
            quien: abierta ? persona(abierta.personaId) : undefined,
            dias: abierta ? diasEntre(abierta.fechaAsignacion) : null,
            completadoEl: ultimaVezCompletado(db, r.territorio, 9999),
          };
        })
        .filter((f) => {
          if (!filtro) return true;
          const t = filtro.toLowerCase();
          return (
            f.resumen.territorio.nombre.toLowerCase().includes(t) ||
            f.resumen.territorio.zona.toLowerCase().includes(t) ||
            (f.quien?.nombre.toLowerCase().includes(t) ?? false)
          );
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, resumenes, filtro],
  );

  const fuera = filas.filter((f) => f.abierta);
  const disponibles = filas
    .filter((f) => !f.abierta)
    .sort((a, b) => {
      if (!a.completadoEl && !b.completadoEl) return a.resumen.territorio.id - b.resumen.territorio.id;
      if (!a.completadoEl) return -1;
      if (!b.completadoEl) return 1;
      return a.completadoEl < b.completadoEl ? -1 : 1;
    });

  return (
    <>
      <div className="fila entre">
        <div>
          <h2>Asignación de territorios</h2>
          <p className="chico suave" style={{ margin: 0 }}>
            {fuera.length} asignados · {disponibles.length} disponibles de {filas.length}
          </p>
        </div>
        <input
          className="btn"
          style={{ minWidth: 200 }}
          placeholder="Buscar territorio, zona o hermano…"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        />
      </div>

      <section className="tarjeta">
        <h3>Territorios asignados ({fuera.length})</h3>
        {fuera.length === 0 ? (
          <Vacio>Ningún territorio está asignado en este momento.</Vacio>
        ) : (
          <div className="desplaza">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Territorio</th>
                  <th>Asignado a</th>
                  <th>Desde</th>
                  <th style={{ textAlign: "right" }}>Días</th>
                  <th style={{ width: 120 }}>Avance</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {fuera.map((f) => (
                  <tr key={f.resumen.territorio.id}>
                    <td>
                      <span className="fila" style={{ gap: 6 }}>
                        <i style={{ width: 10, height: 10, borderRadius: 3, background: f.resumen.territorio.color }} />
                        <strong>{f.resumen.territorio.nombre}</strong>
                        <span className="chico suave">{f.resumen.territorio.zona}</span>
                      </span>
                    </td>
                    <td>{f.quien?.nombre ?? <span className="suave">sin hermano</span>}</td>
                    <td className="mono chico">{fechaCorta(f.abierta!.fechaAsignacion)}</td>
                    <td className="mono" style={{ textAlign: "right" }}>
                      {f.dias! > 30 ? <strong style={{ color: PALETA.critico }}>{f.dias}</strong> : f.dias}
                    </td>
                    <td className="chico suave mono">
                      {f.resumen.trabajadas}/{f.resumen.total} cuadras
                    </td>
                    <td>
                      <div className="fila">
                        <button className="btn chico primario" onClick={() => setCompletando(f.abierta!)}>
                          Completado
                        </button>
                        <button className="btn chico" onClick={() => setEditando(f.abierta!)}>Editar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="tarjeta">
        <h3>Disponibles para asignar ({disponibles.length})</h3>
        <p className="chico suave" style={{ margin: "2px 0 10px" }}>
          Ordenados por el que lleva más tiempo sin completarse: el primero de la lista es el que
          toca.
        </p>
        <div className="desplaza">
          <table className="tabla">
            <thead>
              <tr>
                <th>Territorio</th>
                <th>Zona</th>
                <th style={{ textAlign: "right" }}>Cuadras</th>
                <th>Última vez completado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {disponibles.map((f) => (
                <tr key={f.resumen.territorio.id}>
                  <td>
                    <span className="fila" style={{ gap: 6 }}>
                      <i style={{ width: 10, height: 10, borderRadius: 3, background: f.resumen.territorio.color }} />
                      <strong>{f.resumen.territorio.nombre}</strong>
                    </span>
                  </td>
                  <td className="chico suave">{f.resumen.territorio.zona}</td>
                  <td className="mono" style={{ textAlign: "right" }}>{f.resumen.total}</td>
                  <td className="chico">
                    {f.completadoEl ? (
                      <>
                        <span className="mono">{fechaS13(f.completadoEl)}</span>{" "}
                        <span className="suave">({haceTexto(diasEntre(f.completadoEl))})</span>
                      </>
                    ) : (
                      <span className="suave">sin registro</span>
                    )}
                  </td>
                  <td>
                    <button className="btn chico" onClick={() => setAsignando(f.resumen.territorio)}>
                      Asignar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <HistorialAsignaciones />

      {asignando && <DialogoAsignar t={asignando} onCerrar={() => setAsignando(null)} />}
      {completando && <DialogoCompletar a={completando} onCerrar={() => setCompletando(null)} />}
      {editando && (
        <DialogoEditar
          a={editando}
          onCerrar={() => setEditando(null)}
          onEliminar={() => {
            if (confirmar("¿Eliminar este renglón del registro? Se quita también del S-13.")) {
              acciones.eliminarAsignacion(editando.id);
              setEditando(null);
            }
          }}
        />
      )}
    </>
  );
}

function HistorialAsignaciones() {
  const { db, acciones } = useApp();
  const [ver, setVer] = useState(false);

  const cerradas = useMemo(
    () =>
      db.asignaciones
        .filter((a) => a.fechaCompletado !== null)
        .sort((a, b) => (a.fechaCompletado! < b.fechaCompletado! ? 1 : -1)),
    [db.asignaciones],
  );

  if (cerradas.length === 0) return null;

  return (
    <section className="tarjeta">
      <div className="fila entre">
        <h3>Completados ({cerradas.length})</h3>
        <button className="btn chico" onClick={() => setVer((v) => !v)}>
          {ver ? "Ocultar" : "Ver"}
        </button>
      </div>
      {ver && (
        <div className="desplaza" style={{ marginTop: 10, maxHeight: 320 }}>
          <table className="tabla">
            <thead>
              <tr><th>Territorio</th><th>Hermano</th><th>Asignado</th><th>Completado</th><th>Días</th><th /></tr>
            </thead>
            <tbody>
              {cerradas.slice(0, 100).map((a) => {
                const t = db.territorios.find((x) => x.id === a.territorioId);
                const p = db.personas.find((x) => x.id === a.personaId);
                return (
                  <tr key={a.id}>
                    <td>{t?.nombre ?? a.territorioId}</td>
                    <td>{p?.nombre ?? "—"}</td>
                    <td className="mono chico">{fechaS13(a.fechaAsignacion)}</td>
                    <td className="mono chico">{fechaS13(a.fechaCompletado)}</td>
                    <td className="mono chico">{diasEntre(a.fechaAsignacion, a.fechaCompletado!)}</td>
                    <td>
                      <button
                        className="btn fantasma chico"
                        title="Reabrir"
                        onClick={() => {
                          if (confirmar("Reabrir quita la fecha de completado y los registros que generó. ¿Continuar?")) {
                            acciones.reabrirAsignacion(a.id);
                          }
                        }}
                      >
                        ↺
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* -------------------------------------------------------------- diálogos */

function DialogoAsignar({ t, onCerrar }: { t: Territorio; onCerrar: () => void }) {
  const { db, acciones } = useApp();
  const [personaId, setPersonaId] = useState("");
  const [fecha, setFecha] = useState(hoy());
  const [notas, setNotas] = useState("");

  const activas = db.personas.filter((p) => p.activo);
  const carga = (id: string) =>
    db.asignaciones.filter((a) => a.personaId === id && a.fechaCompletado === null).length;

  return (
    <Modal
      abierto
      titulo={`Asignar ${t.nombre}`}
      onCerrar={onCerrar}
      pie={
        <>
          <button className="btn" onClick={onCerrar}>Cancelar</button>
          <button
            className="btn primario"
            disabled={!personaId}
            onClick={() => {
              acciones.asignarTerritorio({
                territorioId: t.id,
                personaId,
                fechaAsignacion: fecha,
                notas: notas.trim() || undefined,
              });
              onCerrar();
            }}
          >
            Asignar
          </button>
        </>
      }
    >
      <p className="chico suave" style={{ margin: 0 }}>
        {t.zona} · {t.cuadras.filter((c) => c.activa).length} cuadras. Quedará en el S-13 del año de
        servicio {anioServicioDe(fecha)}.
      </p>
      <label className="campo">
        Asignado a
        <select value={personaId} onChange={(e) => setPersonaId(e.target.value)} autoFocus>
          <option value="">Elegir hermano…</option>
          {activas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}{carga(p.id) ? ` — trae ${carga(p.id)}` : ""}
            </option>
          ))}
        </select>
      </label>
      {activas.length === 0 && (
        <p className="chico" style={{ color: PALETA.critico, margin: 0 }}>
          No hay hermanos en el catálogo. Agrégalos en Catálogos → Hermanos.
        </p>
      )}
      <label className="campo">
        Fecha en que se asignó
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </label>
      <label className="campo">
        Notas
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} />
      </label>
    </Modal>
  );
}

function DialogoCompletar({ a, onCerrar }: { a: AsignacionTerritorio; onCerrar: () => void }) {
  const { db, resumenes, acciones } = useApp();
  const [fecha, setFecha] = useState(hoy());
  const [registrar, setRegistrar] = useState(true);

  const t = db.territorios.find((x) => x.id === a.territorioId);
  const r = resumenes.find((x) => x.territorio.id === a.territorioId);
  const p = db.personas.find((x) => x.id === a.personaId);
  const faltantes = r ? r.total - r.trabajadas : 0;

  return (
    <Modal
      abierto
      titulo={`Completar ${t?.nombre ?? ""}`}
      onCerrar={onCerrar}
      pie={
        <>
          <button className="btn" onClick={onCerrar}>Cancelar</button>
          <button
            className="btn primario"
            onClick={() => {
              acciones.completarAsignacion(a.id, fecha, registrar);
              onCerrar();
            }}
          >
            Registrar completado
          </button>
        </>
      }
    >
      <p className="chico suave" style={{ margin: 0 }}>
        {p?.nombre ?? "—"} lo trae desde el {fechaCorta(a.fechaAsignacion)} ({diasEntre(a.fechaAsignacion)} días).
      </p>
      <label className="campo">
        Fecha en que se completó
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </label>

      <label className="fila chico" style={{ alignItems: "flex-start", gap: 8 }}>
        <input
          type="checkbox"
          checked={registrar}
          onChange={(e) => setRegistrar(e.target.checked)}
          style={{ marginTop: 3 }}
        />
        <span>
          Marcar también sus {faltantes > 0 ? faltantes : 0} cuadras pendientes como trabajadas
          en esa fecha.
          <div className="suave">
            Mantiene el mapa y el S-13 diciendo lo mismo. Desmárcalo si el territorio se devolvió
            sin terminar.
          </div>
        </span>
      </label>
    </Modal>
  );
}

function DialogoEditar({
  a, onCerrar, onEliminar,
}: {
  a: AsignacionTerritorio;
  onCerrar: () => void;
  onEliminar: () => void;
}) {
  const { db, acciones } = useApp();
  const [personaId, setPersonaId] = useState(a.personaId);
  const [fecha, setFecha] = useState(a.fechaAsignacion);
  const [notas, setNotas] = useState(a.notas ?? "");

  return (
    <Modal
      abierto
      titulo="Editar asignación"
      onCerrar={onCerrar}
      pie={
        <>
          <button className="btn peligro" onClick={onEliminar}>Eliminar</button>
          <span className="crece" />
          <button className="btn" onClick={onCerrar}>Cancelar</button>
          <button
            className="btn primario"
            onClick={() => {
              acciones.guardarAsignacion({
                ...a,
                personaId,
                fechaAsignacion: fecha,
                notas: notas.trim() || undefined,
              });
              onCerrar();
            }}
          >
            Guardar
          </button>
        </>
      }
    >
      <label className="campo">
        Asignado a
        <select value={personaId} onChange={(e) => setPersonaId(e.target.value)}>
          {db.personas.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>
      </label>
      <label className="campo">
        Fecha en que se asignó
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </label>
      <label className="campo">
        Notas
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} />
      </label>
    </Modal>
  );
}

/** Reexportado para que otras pantallas puedan mostrar el historial. */
export { asignacionesDe };
