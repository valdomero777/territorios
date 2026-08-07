import { useMemo } from "react";
import { BarraApilada, BarrasHorizontales, Columnas, Leyenda, PALETA } from "../components/graficas";
import { BarraAvance, Metrica, Vacio } from "../components/ui";
import type { Dato } from "../components/graficas";
import { diasEntre, fechaCorta, fechaLarga, haceTexto, hoy, sumarDias } from "../domain/fechas";
import { useApp } from "../hooks/useApp";

const SEMANAS = 12;

export function VistaMetricas() {
  const { db, indice, resumenes, global, ciclo } = useApp();

  /* Semana actual y semana anterior, para comparar de un vistazo qué se
     trabajó recién contra lo que se trabajó la semana que le precede. */
  const semanaActual = useMemo(() => {
    const fin = hoy();
    return { inicio: sumarDias(fin, -6), fin };
  }, []);
  const semanaAnterior = useMemo(() => {
    const fin = sumarDias(semanaActual.inicio, -1);
    return { inicio: sumarDias(fin, -6), fin };
  }, [semanaActual]);

  const porTerritorioSemanas = useMemo(() => {
    const m = new Map<number, { actual: number; anterior: number }>();
    for (const r of db.registros) {
      const v = indice.cuadras.get(r.cuadraId);
      if (!v) continue;
      const enActual = r.fecha >= semanaActual.inicio && r.fecha <= semanaActual.fin;
      const enAnterior = r.fecha >= semanaAnterior.inicio && r.fecha <= semanaAnterior.fin;
      if (!enActual && !enAnterior) continue;
      const entrada = m.get(v.territorio.id) ?? { actual: 0, anterior: 0 };
      if (enActual) entrada.actual += 1;
      else entrada.anterior += 1;
      m.set(v.territorio.id, entrada);
    }
    return db.territorios
      .map((t) => ({ territorio: t, ...(m.get(t.id) ?? { actual: 0, anterior: 0 }) }))
      .filter((f) => f.actual > 0 || f.anterior > 0)
      .sort((a, b) => b.actual - a.actual || b.anterior - a.anterior || a.territorio.id - b.territorio.id);
  }, [db.registros, db.territorios, indice, semanaActual, semanaAnterior]);

  const totalSemanas = useMemo(
    () =>
      porTerritorioSemanas.reduce(
        (s, f) => ({ actual: s.actual + f.actual, anterior: s.anterior + f.anterior }),
        { actual: 0, anterior: 0 },
      ),
    [porTerritorioSemanas],
  );

  /* Ritmo: cuadras registradas por semana, últimas 12 semanas. */
  const semanas = useMemo(() => {
    const cubos: Dato[] = [];
    for (let i = SEMANAS - 1; i >= 0; i--) {
      const fin = sumarDias(hoy(), -7 * i);
      const inicio = sumarDias(fin, -6);
      const n = db.registros.filter((r) => r.fecha >= inicio && r.fecha <= fin).length;
      cubos.push({
        clave: inicio,
        etiqueta: `${Number(inicio.slice(8))}/${Number(inicio.slice(5, 7))}`,
        valor: n,
        detalle: `${inicio} al ${fin}: ${n} cuadras`,
      });
    }
    return cubos;
  }, [db.registros]);

  const ritmo4 = useMemo(() => {
    const ult = semanas.slice(-4);
    return ult.length ? ult.reduce((s, d) => s + d.valor, 0) / ult.length : 0;
  }, [semanas]);

  /* Proyección de cierre del ciclo con el ritmo real de las últimas 4 semanas. */
  const proyeccion = useMemo(() => {
    const faltan = global.pendientes;
    if (faltan === 0) return { texto: "Ciclo cubierto", detalle: "Puedes cerrarlo en Ajustes." };
    if (ritmo4 <= 0) return { texto: "Sin ritmo aún", detalle: "Registra jornadas para estimarlo." };
    const dias = Math.ceil((faltan / ritmo4) * 7);
    return {
      texto: fechaLarga(sumarDias(hoy(), dias)),
      detalle: `${faltan} cuadras a ${ritmo4.toFixed(1)} por semana`,
    };
  }, [global, ritmo4]);

  /* Cobertura por zona. */
  const zonas = useMemo(() => {
    const m = new Map<string, { hechas: number; total: number }>();
    for (const r of resumenes) {
      const z = m.get(r.territorio.zona) ?? { hechas: 0, total: 0 };
      z.hechas += r.trabajadas;
      z.total += r.total;
      m.set(r.territorio.zona, z);
    }
    return [...m.entries()]
      .filter(([, v]) => v.total > 0)
      .map(([nombre, v]) => ({
        clave: nombre,
        etiqueta: nombre,
        valor: Math.round((v.hechas / v.total) * 100),
        detalle: `${v.hechas} de ${v.total} cuadras`,
      }))
      .sort((a, b) => a.valor - b.valor);
  }, [resumenes]);

  /* Distribución por antigüedad. */
  const antiguedad = useMemo(() => {
    const activas = indice.todas.filter((v) => v.estado !== "inactiva");
    const cuenta = (f: (d: number | null) => boolean) => activas.filter((v) => f(v.diasDesde)).length;
    return [
      { clave: "reciente", etiqueta: `Hasta ${db.config.umbralReciente} días`, valor: cuenta((d) => d !== null && d <= db.config.umbralReciente), color: PALETA.bueno },
      { clave: "medio", etiqueta: `${db.config.umbralReciente + 1} a ${db.config.umbralMedio} días`, valor: cuenta((d) => d !== null && d > db.config.umbralReciente && d <= db.config.umbralMedio), color: PALETA.aviso },
      { clave: "viejo", etiqueta: `Más de ${db.config.umbralMedio} días`, valor: cuenta((d) => d !== null && d > db.config.umbralMedio), color: PALETA.critico },
      { clave: "nunca", etiqueta: "Nunca registrada", valor: cuenta((d) => d === null), color: PALETA.nunca },
    ].filter((d) => d.valor > 0);
  }, [indice, db.config]);

  /* Carga por capitán dentro del ciclo abierto. */
  const capitanes = useMemo(() => {
    const registros = ciclo ? db.registros.filter((r) => r.cicloId === ciclo.id) : db.registros;
    return db.personas
      .map((c) => {
        const propios = registros.filter((r) => r.capitanId === c.id);
        const salidas = new Set(propios.map((r) => r.fecha)).size;
        return {
          clave: c.id,
          etiqueta: c.nombre,
          valor: propios.length,
          detalle: `${propios.length} cuadras en ${salidas} salidas`,
        };
      })
      .sort((a, b) => b.valor - a.valor);
  }, [db, ciclo]);

  /* Territorios que llevan más tiempo sin atención. */
  const rezagados = useMemo(
    () =>
      [...resumenes]
        .filter((r) => r.total > 0 && r.avance < 1)
        .sort((a, b) => {
          if (a.diasDesde === null && b.diasDesde === null) return a.territorio.id - b.territorio.id;
          if (a.diasDesde === null) return -1;
          if (b.diasDesde === null) return 1;
          return b.diasDesde - a.diasDesde;
        })
        .slice(0, 10),
    [resumenes],
  );

  const diasCiclo = ciclo ? diasEntre(ciclo.inicio) : 0;

  return (
    <div className="rejilla" style={{ gap: 16 }}>
      <h2>Métricas</h2>

      <section className="tarjeta">
        <h3>Semana anterior vs. semana actual</h3>
        <p className="chico suave" style={{ margin: "2px 0 10px" }}>
          Semana anterior: {fechaCorta(semanaAnterior.inicio)} al {fechaCorta(semanaAnterior.fin)} · Semana actual:{" "}
          {fechaCorta(semanaActual.inicio)} al {fechaCorta(semanaActual.fin)}.
        </p>
        {porTerritorioSemanas.length === 0 ? (
          <Vacio>Sin cuadras registradas en estas dos semanas.</Vacio>
        ) : (
          <div className="desplaza">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Territorio</th>
                  <th>Zona</th>
                  <th style={{ textAlign: "right" }}>Semana anterior</th>
                  <th style={{ textAlign: "right" }}>Semana actual</th>
                </tr>
              </thead>
              <tbody>
                {porTerritorioSemanas.map((f) => (
                  <tr key={f.territorio.id}>
                    <td>
                      <span className="fila" style={{ gap: 6 }}>
                        <i style={{ width: 10, height: 10, borderRadius: 3, background: f.territorio.color }} />
                        <strong>{f.territorio.nombre}</strong>
                      </span>
                    </td>
                    <td className="chico suave">{f.territorio.zona}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{f.anterior || "—"}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{f.actual || "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}><strong>Total</strong></td>
                  <td className="mono" style={{ textAlign: "right" }}><strong>{totalSemanas.anterior}</strong></td>
                  <td className="mono" style={{ textAlign: "right" }}><strong>{totalSemanas.actual}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <div className="rejilla auto">
        <Metrica
          nombre="Avance del ciclo"
          valor={`${Math.round(global.avance * 100)}%`}
          color={PALETA.bueno}
          pie={`${global.trabajadas} de ${global.totalCuadras} cuadras · ${diasCiclo} días de ciclo`}
        />
        <Metrica
          nombre="Faltan por trabajar"
          valor={global.pendientes}
          pie={`${global.cuadrasNunca} nunca registradas`}
        />
        <Metrica
          nombre="Ritmo"
          valor={ritmo4.toFixed(1)}
          pie={`cuadras por semana (últimas 4) · meta ${db.config.metaCuadrasSemana}`}
          color={ritmo4 >= db.config.metaCuadrasSemana ? PALETA.bueno : PALETA.aviso}
        />
        <Metrica
          nombre="Cierre proyectado"
          valor={<span style={{ fontSize: "1.05rem", lineHeight: 1.35 }}>{proyeccion.texto}</span>}
          pie={proyeccion.detalle}
        />
      </div>

      <section className="tarjeta">
        <h3>Ritmo semanal</h3>
        <p className="chico suave" style={{ margin: "2px 0 10px" }}>
          Cuadras registradas por semana. La línea punteada es la meta ({db.config.metaCuadrasSemana}).
        </p>
        <Columnas datos={semanas} meta={db.config.metaCuadrasSemana} />
      </section>

      <div className="rejilla dos">
        <section className="tarjeta">
          <h3>Antigüedad de las cuadras</h3>
          <p className="chico suave" style={{ margin: "2px 0 10px" }}>
            Cuánto tiempo llevan sin trabajarse, sobre {global.totalCuadras} cuadras en servicio.
          </p>
          <BarraApilada datos={antiguedad} />
          <Leyenda datos={antiguedad} />
        </section>

        <section className="tarjeta">
          <h3>Cobertura por zona</h3>
          <p className="chico suave" style={{ margin: "2px 0 10px" }}>
            Porcentaje del ciclo cubierto. Las de arriba son las más descuidadas.
          </p>
          <BarrasHorizontales datos={zonas} formato={(n) => `${n}%`} max={100} />
        </section>
      </div>

      <div className="rejilla dos">
        <section className="tarjeta">
          <h3>Participación de capitanes</h3>
          <p className="chico suave" style={{ margin: "2px 0 10px" }}>
            Cuadras registradas en {ciclo?.nombre ?? "el histórico"}.
          </p>
          {capitanes.length === 0 ? (
            <Vacio>Agrega capitanes en Catálogos para ver su participación.</Vacio>
          ) : (
            <BarrasHorizontales datos={capitanes} />
          )}
        </section>

        <section className="tarjeta">
          <h3>Territorios que piden prioridad</h3>
          <p className="chico suave" style={{ margin: "2px 0 10px" }}>
            Los que llevan más tiempo sin atención y aún no se completan.
          </p>
          {rezagados.length === 0 ? (
            <Vacio>Todos los territorios están completos en este ciclo.</Vacio>
          ) : (
            <div className="desplaza">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Territorio</th>
                    <th>Zona</th>
                    <th style={{ width: 110 }}>Avance</th>
                    <th>Último trabajo</th>
                  </tr>
                </thead>
                <tbody>
                  {rezagados.map((r) => (
                    <tr key={r.territorio.id}>
                      <td>
                        <span className="fila" style={{ gap: 6 }}>
                          <i style={{ width: 10, height: 10, borderRadius: 3, background: r.territorio.color }} />
                          <strong>{r.territorio.nombre}</strong>
                        </span>
                      </td>
                      <td className="suave chico">{r.territorio.zona}</td>
                      <td>
                        <BarraAvance valor={r.avance} />
                        <span className="chico suave mono">{r.trabajadas}/{r.total}</span>
                      </td>
                      <td className="chico suave">{haceTexto(r.diasDesde)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="tarjeta">
        <h3>Superficie del territorio</h3>
        <p className="chico suave" style={{ margin: "2px 0 10px" }}>
          Medida sobre la escala del mapa original: cuenta el tamaño real de cada cuadra, no
          solamente cuántas son.
        </p>
        <div className="fila entre">
          <span className="chico suave">
            Cubierto {(global.areaTrabajadaM2 / 1e6).toFixed(2)} km² de{" "}
            {(global.areaTotalM2 / 1e6).toFixed(2)} km²
          </span>
          <strong className="mono">
            {global.areaTotalM2 > 0
              ? Math.round((global.areaTrabajadaM2 / global.areaTotalM2) * 100)
              : 0}
            %
          </strong>
        </div>
        <div style={{ marginTop: 8 }}>
          <BarraAvance
            valor={global.areaTotalM2 > 0 ? global.areaTrabajadaM2 / global.areaTotalM2 : 0}
            color={PALETA.serie}
          />
        </div>
      </section>
    </div>
  );
}
