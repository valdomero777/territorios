import { useMemo, useState } from "react";
import { Chip, Vacio } from "./ui";
import { EditorDia } from "./EditorDia";
import { PALETA } from "./graficas";
import { fechaCorta, hoy } from "../domain/fechas";
import {
  desglosePorDia, desplazar, esSemanaDeServicio, normalizar, resumenPeriodo, semanaDe,
  textoPeriodo,
} from "../domain/periodos";
import type { DiaDelPeriodo, Periodo, ResumenPeriodo } from "../domain/periodos";
import type { Fecha } from "../domain/tipos";
import { useApp } from "../hooks/useApp";

/** Tope del desglose diario: más allá la tabla deja de ser legible. */
const MAX_DIAS_TABLA = 62;

/**
 * Dos periodos lado a lado, cada uno navegable por su cuenta.
 *
 * El punto no es solo ver la semana en curso: es poder retroceder a cualquier
 * semana para revisar si quedó algún día sin capturar, y poder poner dos tramos
 * cualesquiera uno junto al otro para compararlos. Por eso cada panel lleva su
 * propio estado —moverse en uno no toca el otro— y por eso se marcan los días
 * que tuvieron encargado asignado pero ningún registro: ése es justamente el
 * hueco que hay que salir a buscar al chat.
 */
export function ComparadorPeriodos() {
  const { db, indice } = useApp();
  const hoyF = hoy();
  const [izquierda, setIzquierda] = useState<Periodo>(() => desplazar(semanaDe(hoyF), -1));
  const [derecha, setDerecha] = useState<Periodo>(() => semanaDe(hoyF));
  /** Día que se está corrigiendo en el editor, si hay alguno abierto. */
  const [editando, setEditando] = useState<Fecha | null>(null);

  const diasIzq = useMemo(() => desglosePorDia(db, indice, izquierda), [db, indice, izquierda]);
  const diasDer = useMemo(() => desglosePorDia(db, indice, derecha), [db, indice, derecha]);
  const resIzq = useMemo(() => resumenPeriodo(diasIzq), [diasIzq]);
  const resDer = useMemo(() => resumenPeriodo(diasDer), [diasDer]);

  return (
    <section className="rejilla" style={{ gap: 12 }}>
      <div className="fila entre">
        <div>
          <h3 style={{ margin: 0 }}>Comparador de periodos</h3>
          <p className="chico suave" style={{ margin: "2px 0 0" }}>
            Cada panel se mueve por su cuenta: retrocede para revisar semanas viejas, o fija las
            fechas a mano para comparar dos tramos cualesquiera.
          </p>
        </div>
        <button
          className="btn chico"
          onClick={() => {
            setIzquierda(desplazar(semanaDe(hoyF), -1));
            setDerecha(semanaDe(hoyF));
          }}
        >
          Volver a esta semana
        </button>
      </div>

      <div className="rejilla dos">
        <PanelPeriodo
          periodo={izquierda}
          alCambiar={setIzquierda}
          dias={diasIzq}
          resumen={resIzq}
          diferencia={resIzq.cuadras - resDer.cuadras}
          alEditarDia={setEditando}
        />
        <PanelPeriodo
          periodo={derecha}
          alCambiar={setDerecha}
          dias={diasDer}
          resumen={resDer}
          diferencia={resDer.cuadras - resIzq.cuadras}
          alEditarDia={setEditando}
        />
      </div>

      {/* `key` por fecha: cada día abre el editor con su propio borrador, sin
          arrastrar lo que se hubiera tocado en el anterior. */}
      {editando && (
        <EditorDia key={editando} fecha={editando} onCerrar={() => setEditando(null)} />
      )}
    </section>
  );
}

function PanelPeriodo({
  periodo,
  alCambiar,
  dias,
  resumen,
  diferencia,
  alEditarDia,
}: {
  periodo: Periodo;
  alCambiar: (p: Periodo) => void;
  dias: DiaDelPeriodo[];
  resumen: ResumenPeriodo;
  /** Cuadras de más (o de menos) frente al otro panel. */
  diferencia: number;
  alEditarDia: (f: Fecha) => void;
}) {
  const semanaHoy = semanaDe(hoy());
  const esLaActual = esSemanaDeServicio(periodo) && periodo.inicio === semanaHoy.inicio;

  // `alignContent: start` evita que la rejilla reparta el alto sobrante entre
  // sus filas: sin esto, el panel con la tabla más corta estira sus
  // separaciones y las cabeceras de los dos paneles dejan de coincidir.
  return (
    <section className="tarjeta rejilla" style={{ gap: 10, alignContent: "start" }}>
      {/* Cabecera de tres filas fijas (navegar · fechas · resumen). Las mismas
          filas en los dos paneles es lo que los deja alineados uno junto al
          otro aunque el texto del rango cambie de largo. */}
      <div className="fila" style={{ gap: 4, flexWrap: "nowrap" }}>
        <button
          className="btn chico"
          onClick={() => alCambiar(desplazar(periodo, -1))}
          title="Periodo anterior"
          aria-label="Periodo anterior"
        >
          ←
        </button>
        <strong className="crece" style={{ textAlign: "center" }}>
          {textoPeriodo(periodo)}
        </strong>
        <button
          className="btn chico"
          onClick={() => alCambiar(desplazar(periodo, 1))}
          title="Periodo siguiente"
          aria-label="Periodo siguiente"
        >
          →
        </button>
      </div>

      <div className="fila" style={{ gap: 8 }}>
        <label className="campo" style={{ flex: "1 1 130px" }}>
          Desde
          <input
            type="date"
            value={periodo.inicio}
            onChange={(e) =>
              e.target.value && alCambiar(normalizar({ ...periodo, inicio: e.target.value }))
            }
          />
        </label>
        <label className="campo" style={{ flex: "1 1 130px" }}>
          Hasta
          <input
            type="date"
            value={periodo.fin}
            onChange={(e) =>
              e.target.value && alCambiar(normalizar({ ...periodo, fin: e.target.value }))
            }
          />
        </label>
      </div>

      <div className="fila" style={{ gap: 6 }}>
        {esLaActual ? (
          <Chip color={PALETA.bueno}>Semana actual</Chip>
        ) : (
          <button className="btn chico fantasma" onClick={() => alCambiar(semanaHoy)}>
            Ir a hoy
          </button>
        )}
        <Chip color={PALETA.serie}>{resumen.cuadras} cuadras</Chip>
        {diferencia !== 0 && (
          <Chip color={diferencia > 0 ? PALETA.bueno : PALETA.critico}>
            {diferencia > 0 ? "+" : "−"}
            {Math.abs(diferencia)} vs. el otro
          </Chip>
        )}
        {resumen.territoriosCompletados > 0 && (
          <Chip>{resumen.territoriosCompletados} territorios completos</Chip>
        )}
        {resumen.diasSinInforme > 0 && (
          <Chip color={PALETA.critico}>
            {resumen.diasSinInforme}{" "}
            {resumen.diasSinInforme === 1 ? "día sin informe" : "días sin informe"}
          </Chip>
        )}
        {resumen.diasDescuadrados > 0 && (
          <Chip color={PALETA.aviso}>
            {resumen.diasDescuadrados}{" "}
            {resumen.diasDescuadrados === 1 ? "día descuadrado" : "días descuadrados"}
          </Chip>
        )}
      </div>

      <TablaDias dias={dias} alEditarDia={alEditarDia} />
    </section>
  );
}

function TablaDias({
  dias,
  alEditarDia,
}: {
  dias: DiaDelPeriodo[];
  alEditarDia: (f: Fecha) => void;
}) {
  if (dias.length > MAX_DIAS_TABLA) {
    return (
      <Vacio>
        El rango abarca {dias.length} días; arriba siguen contando. Acórtalo a {MAX_DIAS_TABLA} días
        o menos para ver el desglose diario.
      </Vacio>
    );
  }

  return (
    <div className="desplaza">
      <table className="tabla">
        <thead>
          <tr>
            <th style={{ width: 90 }}>Día</th>
            <th>Territorios y cuadras trabajadas</th>
            <th style={{ width: 70 }} />
          </tr>
        </thead>
        <tbody>
          {dias.map((d) => (
            <tr key={d.fecha}>
              <td className="mono chico">{fechaCorta(d.fecha)}</td>
              <td>
                {d.territorios.length === 0 && d.encargados.length === 0 ? (
                  <span className="chico suave">—</span>
                ) : (
                  <div className="rejilla" style={{ gap: 4 }}>
                    {d.territorios.map((t) => (
                      <span
                        key={t.territorio.id}
                        className="fila chico"
                        style={{ gap: 6, flexWrap: "wrap" }}
                      >
                        <i
                          style={{
                            width: 9, height: 9, borderRadius: 3,
                            background: t.territorio.color, flex: "0 0 auto",
                          }}
                        />
                        <strong>{t.territorio.nombre}</strong>
                        {t.terminado ? (
                          <span className="suave">· territorio completo</span>
                        ) : (
                          <span className="suave">: {t.letras.join(", ")}</span>
                        )}
                      </span>
                    ))}
                    {d.encargados.map((e) => (
                      <span
                        key={`${e.modalidad}|${e.nombre}`}
                        className="fila chico"
                        style={{ gap: 6, flexWrap: "wrap" }}
                      >
                        <span className="suave">
                          {e.modalidad}: {e.nombre}
                        </span>
                        {e.marca === "falta" && <Chip color={PALETA.critico}>sin informe</Chip>}
                        {e.marca === "descuadre" && (
                          <Chip color={PALETA.aviso}>sin registros a su nombre</Chip>
                        )}
                        {e.marca === "pendiente" && <Chip color={PALETA.aviso}>pendiente</Chip>}
                      </span>
                    ))}
                  </div>
                )}
              </td>
              <td>
                <button
                  className="btn chico"
                  onClick={() => alEditarDia(d.fecha)}
                  title={`Corregir lo trabajado el ${fechaCorta(d.fecha)}`}
                >
                  Editar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
