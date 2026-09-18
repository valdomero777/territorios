import { useMemo, useState } from "react";
import { Chip, Modal, Vacio, confirmar } from "./ui";
import { PALETA } from "./graficas";
import { diasEntre, fechaCorta, fechaLarga, haceTexto } from "../domain/fechas";
import type { Cuadra, Fecha, Territorio } from "../domain/tipos";
import { useApp } from "../hooks/useApp";

/**
 * Corrección de un día completo desde Métricas.
 *
 * El comparador de periodos es donde se descubre el hueco —"el jueves pasado
 * hubo encargado y nadie capturó nada"—, así que es donde tiene que poder
 * taparse, sin ir al Mapa a buscar cuadra por cuadra. Se marca por cuadra o
 * por territorio completo, y todo se acumula aquí dentro: se escribe una sola
 * vez al guardar, porque cada escritura cuesta cuota de la nube y corregir un
 * día mueve decenas de cuadras a la vez.
 */
export function EditorDia({ fecha, onCerrar }: { fecha: Fecha; onCerrar: () => void }) {
  const { db, acciones } = useApp();

  const registrosDia = useMemo(
    () => db.registros.filter((r) => r.fecha === fecha),
    [db.registros, fecha],
  );
  /** Lo que ya estaba capturado ese día: el punto de partida de la edición. */
  const inicial = useMemo(() => new Set(registrosDia.map((r) => r.cuadraId)), [registrosDia]);
  /** Cuadras cuyo registro de ese día nació de cerrar una asignación del S-13. */
  const delS13 = useMemo(
    () => new Set(registrosDia.filter((r) => r.asignacionId).map((r) => r.cuadraId)),
    [registrosDia],
  );

  /** Salidas del rol ese día: dicen a nombre de quién va lo que se capture. */
  const jornadasDia = useMemo(
    () =>
      db.jornadas
        .filter((j) => j.fecha === fecha && j.capitanId)
        .map((j) => {
          const modalidad = db.config.modalidades.find((m) => m.id === j.modalidadId);
          return {
            capitanId: j.capitanId!,
            nombre: db.personas.find((p) => p.id === j.capitanId)?.nombre ?? "—",
            modalidad: modalidad?.nombre ?? j.modalidadId,
            conTerritorio: modalidad?.conTerritorio ?? false,
          };
        })
        .sort((a, b) => a.modalidad.localeCompare(b.modalidad, "es")),
    [db.jornadas, db.config.modalidades, db.personas, fecha],
  );

  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set(inicial));
  const [filtro, setFiltro] = useState("");
  const [capitanId, setCapitanId] = useState<string>(() => {
    // Si el día tiene un solo encargado de territorio, no hay nada que elegir.
    const conTerritorio = jornadasDia.filter((j) => j.conTerritorio);
    if (conTerritorio.length === 1) return conTerritorio[0].capitanId;
    // Si no, se hereda de lo ya capturado ese día, cuando fue uno solo.
    const yaUsados = [...new Set(registrosDia.map((r) => r.capitanId).filter(Boolean))];
    return yaUsados.length === 1 ? (yaUsados[0] as string) : "";
  });
  const [desplegados, setDesplegados] = useState<Set<number>>(
    () =>
      new Set(
        db.territorios.filter((t) => t.cuadras.some((c) => inicial.has(c.id))).map((t) => t.id),
      ),
  );

  const filas = useMemo(() => {
    const t = filtro.trim().toLowerCase();
    return db.territorios
      .map((x) => ({
        territorio: x,
        // Las inactivas no se ofrecen, pero si una trae registro de ese día hay
        // que poder quitarlo: se dio de baja después de haberse trabajado.
        cuadras: x.cuadras.filter((c) => (c.activa && x.activo) || inicial.has(c.id)),
      }))
      .filter((f) => f.cuadras.length > 0)
      .filter(
        (f) =>
          !t ||
          f.territorio.nombre.toLowerCase().includes(t) ||
          f.territorio.zona.toLowerCase().includes(t) ||
          f.cuadras.some((c) => c.id.toLowerCase().includes(t)),
      )
      // Primero los que ya traían trabajo ese día. Se ordena por `inicial` y no
      // por lo marcado ahora para que la lista no salte bajo el dedo mientras
      // se captura.
      .sort((a, b) => {
        const ta = a.cuadras.some((c) => inicial.has(c.id)) ? 0 : 1;
        const tb = b.cuadras.some((c) => inicial.has(c.id)) ? 0 : 1;
        return ta !== tb ? ta - tb : a.territorio.id - b.territorio.id;
      });
  }, [db.territorios, filtro, inicial]);

  const agregar = useMemo(() => [...marcadas].filter((id) => !inicial.has(id)), [marcadas, inicial]);
  const quitar = useMemo(() => [...inicial].filter((id) => !marcadas.has(id)), [marcadas, inicial]);
  const hayCambios = agregar.length > 0 || quitar.length > 0;

  const alternar = (cuadraId: string) => {
    const quitando = marcadas.has(cuadraId);
    if (quitando && delS13.has(cuadraId) && !confirmarS13(1)) return;
    setMarcadas((prev) => {
      const s = new Set(prev);
      if (quitando) s.delete(cuadraId);
      else s.add(cuadraId);
      return s;
    });
  };

  const todoElTerritorio = (cuadras: Cuadra[], poner: boolean) => {
    if (!poner) {
      const tocadas = cuadras.filter((c) => marcadas.has(c.id) && delS13.has(c.id)).length;
      if (tocadas > 0 && !confirmarS13(tocadas)) return;
    }
    setMarcadas((prev) => {
      const s = new Set(prev);
      for (const c of cuadras) {
        if (poner) s.add(c.id);
        else s.delete(c.id);
      }
      return s;
    });
  };

  const cerrar = () => {
    if (hayCambios && !confirmar("Hay cambios sin guardar en este día. ¿Descartarlos?")) return;
    onCerrar();
  };

  return (
    <Modal
      abierto
      titulo={`Editar ${fechaLarga(fecha)}`}
      onCerrar={cerrar}
      pie={
        <>
          <span className="chico suave crece">
            {hayCambios ? textoCambios(agregar.length, quitar.length) : "Sin cambios"}
          </span>
          <button className="btn" onClick={cerrar}>
            Cancelar
          </button>
          <button
            className="btn primario"
            disabled={!hayCambios}
            onClick={() => {
              acciones.editarDia(fecha, { agregar, quitar, capitanId });
              onCerrar();
            }}
          >
            Guardar
          </button>
        </>
      }
    >
      <div className="fila" style={{ gap: 6 }}>
        <Chip color={PALETA.serie}>{marcadas.size} cuadras ese día</Chip>
        {jornadasDia.length === 0 ? (
          <Chip>Sin encargado en el rol</Chip>
        ) : (
          jornadasDia.map((j) => (
            <Chip key={`${j.modalidad}|${j.capitanId}`}>
              {j.modalidad}: {j.nombre}
            </Chip>
          ))
        )}
      </div>

      <label className="campo">
        Se registra a nombre de
        <select value={capitanId} onChange={(e) => setCapitanId(e.target.value)}>
          <option value="">Sin encargado</option>
          {jornadasDia.length > 0 && (
            <optgroup label="Rol de ese día">
              {jornadasDia.map((j) => (
                <option key={`rol-${j.modalidad}-${j.capitanId}`} value={j.capitanId}>
                  {j.nombre} — {j.modalidad}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Otros hermanos">
            {db.personas
              .filter((p) => p.activo && !jornadasDia.some((j) => j.capitanId === p.id))
              .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
          </optgroup>
        </select>
      </label>
      <p className="chico suave" style={{ margin: "-6px 0 0" }}>
        Solo aplica a lo que marques ahora; las cuadras ya capturadas conservan a quien las
        registró.
      </p>

      <input
        className="btn"
        placeholder="Buscar territorio, zona o cuadra…"
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
      />

      {filas.length === 0 ? (
        <Vacio>Ningún territorio coincide con la búsqueda.</Vacio>
      ) : (
        <div className="rejilla" style={{ gap: 6 }}>
          {filas.map((f) => (
            <FilaTerritorio
              key={f.territorio.id}
              territorio={f.territorio}
              cuadras={f.cuadras}
              marcadas={marcadas}
              inicial={inicial}
              delS13={delS13}
              fecha={fecha}
              desplegado={desplegados.has(f.territorio.id)}
              alDesplegar={() =>
                setDesplegados((prev) => {
                  const s = new Set(prev);
                  if (s.has(f.territorio.id)) s.delete(f.territorio.id);
                  else s.add(f.territorio.id);
                  return s;
                })
              }
              alAlternar={alternar}
              alTodo={(poner) => todoElTerritorio(f.cuadras, poner)}
            />
          ))}
        </div>
      )}
    </Modal>
  );
}

function textoCambios(altas: number, bajas: number): string {
  const partes: string[] = [];
  if (altas) partes.push(`+${altas}`);
  if (bajas) partes.push(`−${bajas}`);
  return `${partes.join(" · ")} cuadras sin guardar`;
}

function confirmarS13(cuantas: number): boolean {
  return confirmar(
    cuantas === 1
      ? "Esa cuadra se registró al cerrar una asignación del S-13. Se quita de la bitácora de ese día; el renglón del S-13 no cambia. ¿Continuar?"
      : `${cuantas} de esas cuadras se registraron al cerrar una asignación del S-13. Se quitan de la bitácora de ese día; el renglón del S-13 no cambia. ¿Continuar?`,
  );
}

function FilaTerritorio({
  territorio,
  cuadras,
  marcadas,
  inicial,
  delS13,
  fecha,
  desplegado,
  alDesplegar,
  alAlternar,
  alTodo,
}: {
  territorio: Territorio;
  cuadras: Cuadra[];
  marcadas: Set<string>;
  inicial: Set<string>;
  delS13: Set<string>;
  fecha: Fecha;
  desplegado: boolean;
  alDesplegar: () => void;
  alAlternar: (cuadraId: string) => void;
  alTodo: (poner: boolean) => void;
}) {
  const { indice } = useApp();
  const puestas = cuadras.filter((c) => marcadas.has(c.id)).length;
  const completo = puestas === cuadras.length;

  /** Último trabajo de la cuadra *fuera* del día que se está editando. */
  const otroTrabajo = (cuadraId: string) =>
    (indice.cuadras.get(cuadraId)?.historial ?? []).find((r) => r.fecha !== fecha) ?? null;

  return (
    <div className="tarjeta" style={{ padding: 10 }}>
      <div className="fila" style={{ gap: 8 }}>
        <button
          className="btn fantasma chico"
          onClick={alDesplegar}
          aria-expanded={desplegado}
          title={desplegado ? "Ocultar cuadras" : "Ver cuadras"}
        >
          {desplegado ? "▾" : "▸"}
        </button>
        {/* `nowrap` + recorte de la zona: en el teléfono, dejar que el nombre y
            la zona se envuelvan partía el renglón en tres y la lista de 39
            territorios se volvía kilométrica. */}
        <span className="fila crece" style={{ gap: 6, flexWrap: "nowrap", minWidth: 0 }}>
          <i
            style={{
              width: 10, height: 10, borderRadius: 3,
              background: territorio.color, flex: "0 0 auto",
            }}
          />
          <strong className="chico" style={{ whiteSpace: "nowrap" }}>{territorio.nombre}</strong>
          <span
            className="chico suave"
            style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {territorio.zona}
          </span>
        </span>
        <span className="chico suave mono">
          {puestas}/{cuadras.length}
        </span>
        <button
          className={`btn chico${completo ? "" : " primario"}`}
          onClick={() => alTodo(!completo)}
          title={
            completo
              ? `Quitar de ese día las ${cuadras.length} cuadras de ${territorio.nombre}`
              : `Marcar las ${cuadras.length} cuadras de ${territorio.nombre} como trabajadas ese día`
          }
        >
          {completo ? "Quitar todo" : "Marcar todo"}
        </button>
      </div>

      {desplegado && (
        <div className="lista-seleccion" style={{ marginTop: 8 }}>
          {cuadras.map((c) => {
            const puesta = marcadas.has(c.id);
            // El punto gris avisa que la cuadra sí se trabajó, pero otro día:
            // marcarla aquí duplicaría el recorrido dentro del ciclo.
            const otro = puesta || inicial.has(c.id) ? null : otroTrabajo(c.id);
            return (
              <button
                key={c.id}
                className="ficha"
                aria-pressed={puesta}
                onClick={() => alAlternar(c.id)}
                title={
                  delS13.has(c.id)
                    ? `${c.id} · registrada al cerrar una asignación del S-13`
                    : otro
                      ? `${c.id} · último trabajo ${fechaCorta(otro.fecha)} (${haceTexto(diasEntre(otro.fecha))})`
                      : `${c.id} · sin otro registro`
                }
              >
                {c.letra}
                {delS13.has(c.id) && <span className="suave">S-13</span>}
                {otro && <i className="color" style={{ background: PALETA.nunca, opacity: 0.45 }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
