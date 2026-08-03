import { useRef } from "react";
import { cerrarSesion } from "../components/PuertaAcceso";
import { Chip, confirmar } from "../components/ui";
import { CONFIGURADO } from "../data/firebase";
import { fechaLarga, hoy } from "../domain/fechas";
import { mapaActualizado } from "../domain/geometriaExportar";
import { mapaBase } from "../domain/mapa";
import type { BaseDatos, PoliticaCiclo } from "../domain/tipos";
import { useApp } from "../hooks/useApp";

const POLITICAS: { clave: PoliticaCiclo; nombre: string; detalle: string }[] = [
  {
    clave: "estricto",
    nombre: "Ciclo completo",
    detalle:
      "No se puede reasignar una cuadra ya trabajada en el ciclo abierto. Garantiza que se recorra todo antes de repetir.",
  },
  {
    clave: "libre",
    nombre: "Ciclo con reasignación libre",
    detalle:
      "El ciclo sirve de referencia y avance, pero puedes reasignar cualquier cuadra cuando la necesidad lo pida. La app solo advierte.",
  },
  {
    clave: "sinCiclo",
    nombre: "Sin ciclos, solo antigüedad",
    detalle:
      "No hay vueltas. La prioridad es siempre la cuadra que lleva más tiempo sin trabajarse.",
  },
];

export function VistaAjustes() {
  const { db, ciclo, global, acciones, repoNombre } = useApp();
  const archivo = useRef<HTMLInputElement>(null);

  const exportar = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `territorios-${hoy()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importar = async (f: File) => {
    try {
      const datos = JSON.parse(await f.text()) as BaseDatos;
      if (!Array.isArray(datos.territorios)) throw new Error("formato");
      if (
        confirmar(
          `El respaldo trae ${datos.territorios.length} territorios y ${datos.registros?.length ?? 0} registros. ` +
            "Esto reemplaza TODOS los datos actuales de este dispositivo. ¿Continuar?",
        )
      ) {
        acciones.reemplazarBase(datos);
      }
    } catch {
      alert("No se pudo leer el archivo: no parece un respaldo válido.");
    }
  };

  const exportarMapa = () => {
    const actualizado = mapaActualizado(db.geometriaEditada);
    const blob = new Blob([JSON.stringify(actualizado)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mapa_editado.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rejilla" style={{ gap: 16, maxWidth: 760 }}>
      <h2>Ajustes</h2>

      <section className="tarjeta rejilla" style={{ gap: 12 }}>
        <h3>Congregación</h3>
        <label className="campo">
          Nombre
          <input
            value={db.config.nombreCongregacion}
            onChange={(e) => acciones.guardarConfig({ nombreCongregacion: e.target.value })}
          />
        </label>
        <p className="chico suave" style={{ margin: 0 }}>
          Mapa base: {mapaBase.meta.origen} · revisión {mapaBase.meta.revision} ·{" "}
          {mapaBase.meta.totalTerritorios} territorios y {mapaBase.meta.totalCuadras} cuadras.
        </p>
      </section>

      <section className="tarjeta rejilla" style={{ gap: 12 }}>
        <h3>Cómo se recorre el territorio</h3>
        {POLITICAS.map((p) => (
          <label key={p.clave} className="fila" style={{ alignItems: "flex-start", gap: 10 }}>
            <input
              type="radio"
              name="politica"
              checked={db.config.politicaCiclo === p.clave}
              onChange={() => acciones.guardarConfig({ politicaCiclo: p.clave })}
              style={{ marginTop: 4 }}
            />
            <span className="crece">
              <strong className="chico">{p.nombre}</strong>
              <div className="chico suave">{p.detalle}</div>
            </span>
          </label>
        ))}
      </section>

      <section className="tarjeta rejilla" style={{ gap: 12 }}>
        <h3>Modalidades del rol</h3>
        <p className="chico suave" style={{ margin: 0 }}>
          Las formas de servicio que aparecen en el rol de encargados. Las que llevan cuadras son
          las que recorren el territorio; Cartas y Zoom no.
        </p>
        <div className="desplaza">
          <table className="tabla">
            <thead>
              <tr><th>Modalidad</th><th style={{ textAlign: "center" }}>Lleva cuadras</th><th style={{ textAlign: "center" }}>Activa</th></tr>
            </thead>
            <tbody>
              {[...db.config.modalidades].sort((a, b) => a.orden - b.orden).map((m) => (
                <tr key={m.id}>
                  <td>
                    <input
                      value={m.nombre}
                      style={{ border: "1px solid var(--borde)", borderRadius: 7, padding: "4px 7px", width: 140 }}
                      onChange={(e) =>
                        acciones.guardarConfig({
                          modalidades: db.config.modalidades.map((x) =>
                            x.id === m.id ? { ...x, nombre: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={m.conTerritorio}
                      onChange={(e) =>
                        acciones.guardarConfig({
                          modalidades: db.config.modalidades.map((x) =>
                            x.id === m.id ? { ...x, conTerritorio: e.target.checked } : x,
                          ),
                        })
                      }
                    />
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={m.activa}
                      onChange={(e) =>
                        acciones.guardarConfig({
                          modalidades: db.config.modalidades.map((x) =>
                            x.id === m.id ? { ...x, activa: e.target.checked } : x,
                          ),
                        })
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <label className="campo">
          Nota al pie del rol impreso
          <textarea
            value={db.config.notaRol}
            onChange={(e) => acciones.guardarConfig({ notaRol: e.target.value })}
          />
        </label>
      </section>

      <section className="tarjeta rejilla" style={{ gap: 12 }}>
        <h3>Umbrales</h3>
        <div className="rejilla" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
          <label className="campo">
            Advertir si se repite antes de (días)
            <input
              type="number" min={0}
              value={db.config.diasAlertaRepeticion}
              onChange={(e) => acciones.guardarConfig({ diasAlertaRepeticion: Number(e.target.value) })}
            />
          </label>
          <label className="campo">
            Verde hasta (días)
            <input
              type="number" min={1}
              value={db.config.umbralReciente}
              onChange={(e) => acciones.guardarConfig({ umbralReciente: Number(e.target.value) })}
            />
          </label>
          <label className="campo">
            Amarillo hasta (días)
            <input
              type="number" min={1}
              value={db.config.umbralMedio}
              onChange={(e) => acciones.guardarConfig({ umbralMedio: Number(e.target.value) })}
            />
          </label>
          <label className="campo">
            Meta de cuadras por semana
            <input
              type="number" min={1}
              value={db.config.metaCuadrasSemana}
              onChange={(e) => acciones.guardarConfig({ metaCuadrasSemana: Number(e.target.value) })}
            />
          </label>
        </div>
      </section>

      <section className="tarjeta rejilla" style={{ gap: 12 }}>
        <h3>Ciclos</h3>
        {ciclo ? (
          <div className="fila entre">
            <div>
              <strong>{ciclo.nombre}</strong>
              <div className="chico suave">
                Inició el {fechaLarga(ciclo.inicio)} · {global.trabajadas} de {global.totalCuadras} cuadras
                ({Math.round(global.avance * 100)}%)
              </div>
            </div>
            <button
              className="btn"
              onClick={() => {
                const faltan = global.totalCuadras - global.trabajadas;
                const aviso =
                  faltan > 0
                    ? `Aún faltan ${faltan} cuadras por trabajar en este ciclo. `
                    : "";
                if (confirmar(`${aviso}Al cerrar el ciclo todo vuelve a "pendiente", pero el historial se conserva. ¿Continuar?`)) {
                  acciones.cerrarCiclo();
                }
              }}
            >
              Cerrar ciclo e iniciar el siguiente
            </button>
          </div>
        ) : (
          <p className="chico suave">No hay un ciclo abierto.</p>
        )}

        {db.ciclos.length > 1 && (
          <table className="tabla">
            <thead><tr><th>Ciclo</th><th>Inicio</th><th>Fin</th></tr></thead>
            <tbody>
              {[...db.ciclos].reverse().map((c) => (
                <tr key={c.id}>
                  <td>{c.nombre}</td>
                  <td className="mono chico">{c.inicio}</td>
                  <td className="mono chico">{c.fin ?? "en curso"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="tarjeta rejilla" style={{ gap: 12 }}>
        <h3>Respaldo y sincronización</h3>
        <p className="chico suave" style={{ margin: 0 }}>
          Guardado actual: <Chip>{repoNombre}</Chip>{" "}
          {CONFIGURADO
            ? "Los datos se comparten en vivo entre todos los que entren con la clave del grupo. El respaldo sigue sirviendo como copia de seguridad aparte."
            : "Los datos viven en este navegador. Para compartir el avance con los auxiliares hoy, exporta el respaldo y pásalo."}
        </p>
        <div className="fila">
          <button className="btn primario" onClick={exportar}>Exportar respaldo</button>
          <button className="btn" onClick={() => archivo.current?.click()}>Importar respaldo</button>
          {CONFIGURADO && (
            <button className="btn" onClick={() => void cerrarSesion()}>Cerrar sesión</button>
          )}
          <input
            ref={archivo}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importar(f);
              e.target.value = "";
            }}
          />
        </div>
        <div className="fila chico suave">
          {db.registros.length} registros · {db.jornadas.length} jornadas · {db.personas.length} personas
        </div>
      </section>

      {Object.keys(db.geometriaEditada).length > 0 && (
        <section className="tarjeta rejilla" style={{ gap: 12 }}>
          <h3>Geometría corregida a mano</h3>
          <p className="chico suave" style={{ margin: 0 }}>
            {Object.keys(db.geometriaEditada).length} cuadra(s) con la forma corregida en Mapa →
            Editar forma. Ese cambio vive solo en este dispositivo hasta que exportes el mapa
            actualizado y reemplaces <code>src/data/mapa.json</code> en el proyecto (y se despliegue
            de nuevo) — ahí se vuelve la geometría oficial para todos.
          </p>
          <div className="fila">
            <button className="btn primario" onClick={exportarMapa}>Exportar mapa.json actualizado</button>
            <button
              className="btn"
              onClick={() => {
                if (confirmar("¿Vaciar el borrador de forma corregida? Úsalo solo después de reemplazar y desplegar el mapa.json exportado.")) {
                  acciones.limpiarBorradorGeometria();
                }
              }}
            >
              Limpiar borrador
            </button>
          </div>
        </section>
      )}

      <section className="tarjeta rejilla" style={{ gap: 12, borderColor: "#fecaca" }}>
        <h3>Zona de riesgo</h3>
        <p className="chico suave" style={{ margin: 0 }}>
          Reiniciar borra registros, jornadas, capitanes y puntos de reunión, y deja los territorios
          como vienen del mapa original. Exporta un respaldo antes.
        </p>
        <div>
          <button
            className="btn peligro"
            onClick={() => {
              if (
                confirmar("Se borrarán TODOS los datos capturados. ¿Seguro?") &&
                confirmar("Última confirmación: esto no se puede deshacer. ¿Reiniciar?")
              ) {
                acciones.reiniciar();
              }
            }}
          >
            Reiniciar todo
          </button>
        </div>
      </section>
    </div>
  );
}
