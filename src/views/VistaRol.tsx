import { useMemo, useState } from "react";
import { Modal, Vacio, confirmar } from "../components/ui";
import {
  diaSemana, diasDelMes, fechaLarga, hoy, mesActual, mesSiguiente, nombreMesLargo,
} from "../domain/fechas";
import type { Fecha, Jornada, Modalidad } from "../domain/tipos";
import { useApp } from "../hooks/useApp";

/**
 * Rol de encargados de grupo de predicación.
 *
 * Reproduce el calendario mensual que hoy se lleva en hoja de cálculo: semanas
 * de lunes a domingo y, en cada día, una línea por modalidad con su encargado,
 * más los días señalados (asamblea, día de campo…). Los nombres los elige el
 * responsable: la app no reparte por su cuenta, solo acota la lista a quienes
 * están disponibles ese día en esa modalidad.
 */

const DIAS_LUNES_PRIMERO = [1, 2, 3, 4, 5, 6, 0];
const NOMBRE_DIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function VistaRol() {
  const { db, acciones } = useApp();
  const [mes, setMes] = useState(mesActual());
  const [dia, setDia] = useState<Fecha | null>(null);

  const modalidades = useMemo(
    () => db.config.modalidades.filter((m) => m.activa).sort((a, b) => a.orden - b.orden),
    [db.config.modalidades],
  );

  const dias = useMemo(() => diasDelMes(mes), [mes]);

  const porDia = useMemo(() => {
    const m = new Map<Fecha, Jornada[]>();
    for (const j of db.jornadas) {
      if (!j.fecha.startsWith(mes)) continue;
      const l = m.get(j.fecha);
      if (l) l.push(j);
      else m.set(j.fecha, [j]);
    }
    const orden = new Map(modalidades.map((x, i) => [x.id, i]));
    for (const l of m.values()) {
      l.sort((a, b) => (orden.get(a.modalidadId) ?? 99) - (orden.get(b.modalidadId) ?? 99));
    }
    return m;
  }, [db.jornadas, mes, modalidades]);

  const eventos = useMemo(
    () => new Map(db.eventos.filter((e) => e.fecha.startsWith(mes)).map((e) => [e.fecha, e])),
    [db.eventos, mes],
  );

  /** Semanas de lunes a domingo, incluyendo los días de meses vecinos. */
  const semanas = useMemo(() => {
    if (!dias.length) return [];
    const primero = dias[0];
    const desfase = (diaSemana(primero) + 6) % 7; // lunes = 0
    const celdas: (Fecha | null)[] = [
      ...Array.from({ length: desfase }, () => null),
      ...dias,
    ];
    while (celdas.length % 7 !== 0) celdas.push(null);
    const filas: (Fecha | null)[][] = [];
    for (let i = 0; i < celdas.length; i += 7) filas.push(celdas.slice(i, i + 7));
    return filas;
  }, [dias]);

  const nombre = (id: string | null) => db.personas.find((p) => p.id === id)?.nombre ?? "";

  const anterior = mesSiguiente(mes, -1);
  const totalMes = [...porDia.values()].reduce((s, l) => s + l.length, 0);

  return (
    <div className="rejilla" style={{ gap: 16 }}>
      <div className="fila entre no-imprimir">
        <div className="fila">
          <button className="btn chico" onClick={() => setMes(mesSiguiente(mes, -1))}>←</button>
          <h2 style={{ minWidth: 190, textAlign: "center" }}>{nombreMesLargo(mes)}</h2>
          <button className="btn chico" onClick={() => setMes(mesSiguiente(mes, 1))}>→</button>
        </div>
        <div className="fila">
          <button className="btn" onClick={() => setMes(mesActual())}>Mes actual</button>
          <button
            className="btn"
            onClick={() => {
              const n = acciones.copiarRol(anterior, mes);
              if (n === 0) {
                alert(`No había nada que copiar de ${nombreMesLargo(anterior)}.`);
              }
            }}
            title={`Repite el patrón de ${nombreMesLargo(anterior)} en este mes`}
          >
            Copiar de {nombreMesLargo(anterior).split(" ")[0]}
          </button>
          <button className="btn primario" onClick={() => window.print()}>Imprimir</button>
        </div>
      </div>

      <p className="chico suave no-imprimir" style={{ margin: 0 }}>
        {totalMes} asignaciones este mes. Toca un día para poner o cambiar sus encargados. Al
        copiar del mes anterior se repite el patrón por día de la semana; los nombres siempre
        quedan a tu criterio.
      </p>

      <div className="hoja-rol">
        <h3 className="rol-titulo">Rol de encargado de grupo de predicación</h3>
        <p className="rol-mes">{nombreMesLargo(mes)}</p>

        <table className="rol">
          <thead>
            <tr>
              {DIAS_LUNES_PRIMERO.map((d) => (
                <th key={d}>{NOMBRE_DIA[d]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {semanas.map((semana, i) => (
              <tr key={i}>
                {semana.map((f, j) => {
                  if (!f) return <td key={j} className="rol-vacio" />;
                  const lista = porDia.get(f) ?? [];
                  const evento = eventos.get(f);
                  return (
                    <td
                      key={j}
                      className={`rol-dia${f === hoy() ? " rol-hoy" : ""}`}
                      onClick={() => setDia(f)}
                    >
                      <span className="rol-num">{Number(f.slice(8))}</span>
                      {evento && <span className="rol-evento">{evento.texto}</span>}
                      {lista.map((jj) => {
                        const m = modalidades.find((x) => x.id === jj.modalidadId);
                        return (
                          <span key={jj.id} className="rol-linea">
                            <b>{m?.nombre ?? jj.modalidadId}:</b> {nombre(jj.capitanId) || "—"}
                          </span>
                        );
                      })}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {db.config.notaRol && (
          <p className="rol-nota">
            <strong>Notas: </strong>
            {db.config.notaRol}
          </p>
        )}
      </div>

      <ResumenCarga mes={mes} modalidades={modalidades} />

      {dia && <EditorDia fecha={dia} onCerrar={() => setDia(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------ editor del día */

function EditorDia({ fecha, onCerrar }: { fecha: Fecha; onCerrar: () => void }) {
  const { db, acciones } = useApp();
  const d = diaSemana(fecha);

  const modalidades = db.config.modalidades
    .filter((m) => m.activa)
    .sort((a, b) => a.orden - b.orden);
  const jornadas = db.jornadas.filter((j) => j.fecha === fecha);
  const evento = db.eventos.find((e) => e.fecha === fecha);
  const [texto, setTexto] = useState(evento?.texto ?? "");

  /** Quienes están disponibles ese día para esa modalidad, primero los demás. */
  const candidatos = (modalidadId: string) => {
    const disponibles = db.personas.filter(
      (p) => p.activo && p.esCapitan && (p.disponibilidad[modalidadId] ?? []).includes(d),
    );
    const resto = db.personas.filter((p) => p.activo && p.esCapitan && !disponibles.includes(p));
    return { disponibles, resto };
  };

  return (
    <Modal
      abierto
      titulo={fechaLarga(fecha)}
      onCerrar={onCerrar}
      pie={
        <>
          <button
            className="btn"
            onClick={() => {
              acciones.guardarEvento(fecha, texto);
              onCerrar();
            }}
          >
            Guardar y cerrar
          </button>
        </>
      }
    >
      <p className="chico suave" style={{ margin: 0 }}>
        La lista muestra primero a quienes están disponibles el <strong>{NOMBRE_DIA[d]}</strong> en
        esa modalidad, según Catálogos → Hermanos. Puedes elegir a cualquiera de todas formas.
      </p>

      {modalidades.map((m) => {
        const j = jornadas.find((x) => x.modalidadId === m.id);
        const { disponibles, resto } = candidatos(m.id);
        return (
          <div key={m.id} className="fila" style={{ gap: 8 }}>
            <strong className="chico" style={{ minWidth: 66 }}>{m.nombre}</strong>
            <select
              className="crece"
              style={{ padding: "7px 9px", borderRadius: 9, border: "1px solid var(--borde-fuerte)" }}
              value={j?.capitanId ?? ""}
              onChange={(e) => {
                const personaId = e.target.value || null;
                if (!personaId) {
                  if (j) acciones.eliminarJornada(j.id);
                  return;
                }
                acciones.guardarJornada({
                  id: j?.id,
                  fecha,
                  modalidadId: m.id,
                  capitanId: personaId,
                  notas: j?.notas,
                });
              }}
            >
              <option value="">— sin encargado —</option>
              {disponibles.length > 0 && (
                <optgroup label={`Disponibles el ${NOMBRE_DIA[d]}`}>
                  {disponibles.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </optgroup>
              )}
              {resto.length > 0 && (
                <optgroup label="Otros encargados">
                  {resto.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        );
      })}

      <label className="campo">
        Día señalado (asamblea, día de campo, conmemoración…)
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Se muestra en el rol impreso"
        />
      </label>

      {jornadas.length > 0 && (
        <button
          className="btn chico peligro"
          onClick={() => {
            if (confirmar("¿Quitar todos los encargados de este día?")) {
              for (const j of jornadas) acciones.eliminarJornada(j.id);
            }
          }}
        >
          Vaciar el día
        </button>
      )}
    </Modal>
  );
}

/* ---------------------------------------------------------- carga del mes */

function ResumenCarga({ mes, modalidades }: { mes: string; modalidades: Modalidad[] }) {
  const { db } = useApp();

  const filas = useMemo(() => {
    const delMes = db.jornadas.filter((j) => j.fecha.startsWith(mes) && j.capitanId);
    const m = new Map<string, { total: number; porModalidad: Record<string, number> }>();
    for (const j of delMes) {
      const e = m.get(j.capitanId!) ?? { total: 0, porModalidad: {} };
      e.total += 1;
      e.porModalidad[j.modalidadId] = (e.porModalidad[j.modalidadId] ?? 0) + 1;
      m.set(j.capitanId!, e);
    }
    return [...m.entries()]
      .map(([id, v]) => ({ persona: db.personas.find((p) => p.id === id), ...v }))
      .sort((a, b) => b.total - a.total);
  }, [db.jornadas, db.personas, mes]);

  if (filas.length === 0) {
    return (
      <Vacio>
        Sin encargados asignados este mes. Toca un día del calendario para empezar, o copia el
        patrón del mes anterior.
      </Vacio>
    );
  }

  return (
    <section className="tarjeta no-imprimir">
      <h3>Veces que participa cada encargado</h3>
      <div className="desplaza" style={{ marginTop: 8 }}>
        <table className="tabla">
          <thead>
            <tr>
              <th>Hermano</th>
              {modalidades.map((m) => (
                <th key={m.id} style={{ textAlign: "right" }}>{m.nombre}</th>
              ))}
              <th style={{ textAlign: "right" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.persona?.id ?? Math.random()}>
                <td>{f.persona?.nombre ?? "—"}</td>
                {modalidades.map((m) => (
                  <td key={m.id} className="mono chico" style={{ textAlign: "right" }}>
                    {f.porModalidad[m.id] || ""}
                  </td>
                ))}
                <td className="mono" style={{ textAlign: "right" }}><strong>{f.total}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
