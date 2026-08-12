import { useMemo, useState } from "react";
import { BarraAvance, Chip, Modal, Vacio, confirmar } from "../components/ui";
import { MapaReal } from "../components/MapaReal";
import { areaTexto, enlaceMapas } from "../domain/mapa";
import { fechaCorta, haceTexto, nombreDiaCorto } from "../domain/fechas";
import type { CasaMarcada, LatLng, Persona, PuntoReunion, Territorio } from "../domain/tipos";
import { useApp } from "../hooks/useApp";

type Pestana = "territorios" | "personas" | "puntos" | "casasMarcadas";

export function VistaCatalogos() {
  const [p, setP] = useState<Pestana>("territorios");
  return (
    <div className="rejilla" style={{ gap: 16 }}>
      <div className="fila">
        {([
          ["territorios", "Territorios"],
          ["personas", "Hermanos"],
          ["puntos", "Puntos de reunión"],
          ["casasMarcadas", "Casas marcadas"],
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
      {p === "territorios" && <Territorios />}
      {p === "personas" && <Personas />}
      {p === "puntos" && <Puntos />}
      {p === "casasMarcadas" && <CasasMarcadas />}
    </div>
  );
}

/* ------------------------------------------------------------ territorios */

function Territorios() {
  const { resumenes } = useApp();
  const [editando, setEditando] = useState<Territorio | null>(null);
  const [zona, setZona] = useState("");

  const zonas = useMemo(
    () => [...new Set(resumenes.map((r) => r.territorio.zona))].sort((a, b) => a.localeCompare(b, "es")),
    [resumenes],
  );
  const lista = zona ? resumenes.filter((r) => r.territorio.zona === zona) : resumenes;

  return (
    <>
      <div className="fila entre">
        <h2>Territorios ({lista.length})</h2>
        <select className="btn" value={zona} onChange={(e) => setZona(e.target.value)}>
          <option value="">Todas las zonas</option>
          {zonas.map((z) => <option key={z} value={z}>{z}</option>)}
        </select>
      </div>

      <div className="tarjeta desplaza">
        <table className="tabla">
          <thead>
            <tr>
              <th>Territorio</th>
              <th>Zona</th>
              <th style={{ textAlign: "right" }}>Cuadras</th>
              <th style={{ textAlign: "right" }}>Área</th>
              <th style={{ width: 140 }}>Avance</th>
              <th>Último trabajo</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lista.map((r) => (
              <tr key={r.territorio.id}>
                <td>
                  <span className="fila" style={{ gap: 6 }}>
                    <i style={{ width: 12, height: 12, borderRadius: 3, background: r.territorio.color }} />
                    <strong>{r.territorio.nombre}</strong>
                    {!r.territorio.activo && <span className="chico suave">(fuera de servicio)</span>}
                  </span>
                </td>
                <td className="suave">{r.territorio.zona}</td>
                <td className="mono" style={{ textAlign: "right" }}>{r.total}</td>
                <td className="mono suave" style={{ textAlign: "right" }}>{areaTexto(r.areaM2)}</td>
                <td>
                  <BarraAvance valor={r.avance} />
                  <span className="chico suave mono">{r.trabajadas}/{r.total}</span>
                </td>
                <td className="chico suave">{haceTexto(r.diasDesde)}</td>
                <td>
                  <button className="btn chico" onClick={() => setEditando(r.territorio)}>Editar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editando && <EditorTerritorio t={editando} onCerrar={() => setEditando(null)} />}
    </>
  );
}

function EditorTerritorio({ t, onCerrar }: { t: Territorio; onCerrar: () => void }) {
  const { db, indice, acciones } = useApp();
  const [nombre, setNombre] = useState(t.nombre);
  const [zona, setZona] = useState(t.zona);
  const [color, setColor] = useState(t.color);
  const [notas, setNotas] = useState(t.notas ?? "");

  const zonas = useMemo(
    () => [...new Set(db.territorios.map((x) => x.zona))].sort((a, b) => a.localeCompare(b, "es")),
    [db.territorios],
  );

  return (
    <Modal
      abierto
      titulo={`Editar ${t.nombre}`}
      onCerrar={onCerrar}
      pie={
        <>
          <button className="btn" onClick={onCerrar}>Cerrar</button>
          <button
            className="btn primario"
            onClick={() => {
              acciones.guardarTerritorio(t.id, {
                nombre: nombre.trim() || t.nombre,
                zona: zona.trim() || t.zona,
                color,
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
      <div className="rejilla" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label className="campo">
          Nombre
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label className="campo">
          Zona
          <input list="zonas-existentes" value={zona} onChange={(e) => setZona(e.target.value)} />
          <datalist id="zonas-existentes">
            {zonas.map((z) => <option key={z} value={z} />)}
          </datalist>
        </label>
        <label className="campo">
          Color en el mapa
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
        <label className="fila chico" style={{ alignSelf: "end", paddingBottom: 8 }}>
          <input
            type="checkbox"
            checked={t.activo}
            onChange={(e) => acciones.guardarTerritorio(t.id, { activo: e.target.checked })}
          />
          Territorio en servicio
        </label>
      </div>

      <label className="campo">
        Notas
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} />
      </label>

      <div>
        <h4 className="chico suave">Cuadras ({t.cuadras.length})</h4>
        <div className="desplaza" style={{ maxHeight: 260, marginTop: 6 }}>
          <table className="tabla">
            <thead>
              <tr><th>Cuadra</th><th>Área</th><th>Último</th><th>En servicio</th><th>Mover a</th></tr>
            </thead>
            <tbody>
              {t.cuadras.map((c) => {
                const v = indice.cuadras.get(c.id);
                return (
                  <tr key={c.id}>
                    <td><strong>{c.letra}</strong> <span className="chico suave">{c.id}</span></td>
                    <td className="chico suave mono">{areaTexto(c.areaM2)}</td>
                    <td className="chico suave">{haceTexto(v?.diasDesde ?? null)}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={c.activa}
                        onChange={(e) => acciones.guardarCuadra(t.id, c.id, { activa: e.target.checked })}
                      />
                    </td>
                    <td>
                      <select
                        value=""
                        onChange={(e) => {
                          const destino = Number(e.target.value);
                          if (!destino) return;
                          if (confirmar(`¿Mover la cuadra ${c.id} al territorio ${destino}? Su historial se va con ella.`)) {
                            acciones.moverCuadra(c.id, destino);
                          }
                        }}
                      >
                        <option value="">—</option>
                        {db.territorios
                          .filter((x) => x.id !== t.id)
                          .map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="chico suave" style={{ marginBottom: 0 }}>
          La geometría de las cuadras viene del mapa original. Para cambiar los polígonos hay que
          regenerar el mapa desde el PDF con <code>tools/extraer_mapa.py</code>.
        </p>
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------------- personas */

function Personas() {
  const { db, acciones } = useApp();
  const [editando, setEditando] = useState<Partial<Persona> | null>(null);
  const [soloCapitanes, setSoloCapitanes] = useState(false);

  const lista = soloCapitanes ? db.personas.filter((p) => p.esCapitan) : db.personas;

  return (
    <>
      <div className="fila entre">
        <h2>Hermanos ({db.personas.length})</h2>
        <div className="fila">
          <label className="fila chico suave" style={{ gap: 6 }}>
            <input
              type="checkbox"
              checked={soloCapitanes}
              onChange={(e) => setSoloCapitanes(e.target.checked)}
            />
            Solo capitanes
          </label>
          <button
            className="btn primario"
            onClick={() =>
              setEditando({ nombre: "", activo: true, esCapitan: false, disponibilidad: {} })
            }
          >
            + Nuevo hermano
          </button>
        </div>
      </div>

      <p className="chico suave" style={{ margin: 0 }}>
        A un hermano se le asignan territorios (es lo que se anota en el S-13). Márcalo además
        como <strong>capitán de grupo</strong> si dirige salidas diarias, para que aparezca en el
        rol mensual.
      </p>

      {db.personas.length === 0 ? (
        <Vacio>Sin hermanos todavía. Agrégalos para poder asignar territorios y armar el rol.</Vacio>
      ) : (
        <div className="rejilla auto">
          {lista.map((c) => {
            const territorios = db.asignaciones.filter(
              (a) => a.personaId === c.id && a.fechaCompletado === null,
            );
            return (
              <article key={c.id} className="tarjeta">
                <div className="fila entre">
                  <strong>{c.nombre}</strong>
                  <Chip color={c.activo ? "#00843d" : "#94a3b8"}>{c.activo ? "Activo" : "Inactivo"}</Chip>
                </div>
                <div className="fila" style={{ marginTop: 6 }}>
                  {c.esCapitan && <Chip color="#2a78d6">Capitán de grupo</Chip>}
                  {territorios.length > 0 && (
                    <Chip color="#c07800">
                      Trae {territorios.length} territorio{territorios.length > 1 ? "s" : ""}
                    </Chip>
                  )}
                </div>
                {c.telefono && <p className="chico suave" style={{ margin: "6px 0 0" }}>{c.telefono}</p>}
                {c.esCapitan && <Disponible p={c} />}
                <div className="fila" style={{ marginTop: 10 }}>
                  <button className="btn chico" onClick={() => setEditando(c)}>Editar</button>
                  <button
                    className="btn chico peligro"
                    onClick={() => {
                      const aviso = territorios.length
                        ? ` Trae ${territorios.length} territorio(s) sin devolver.`
                        : "";
                      if (confirmar(`¿Eliminar a ${c.nombre}?${aviso} Sus jornadas quedarán sin capitán.`)) {
                        acciones.eliminarPersona(c.id);
                      }
                    }}
                  >
                    Eliminar
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editando && <EditorPersona c={editando} onCerrar={() => setEditando(null)} />}
    </>
  );
}

/** Resumen de en qué días y modalidades puede encargarse el hermano. */
function Disponible({ p }: { p: Persona }) {
  const { db } = useApp();
  const lineas = db.config.modalidades
    .filter((m) => m.activa)
    .sort((a, b) => a.orden - b.orden)
    .map((m) => ({ m, dias: p.disponibilidad[m.id] ?? [] }))
    .filter((x) => x.dias.length > 0);

  if (lineas.length === 0) {
    return <p className="chico suave" style={{ margin: "6px 0 0" }}>Sin disponibilidad marcada.</p>;
  }
  return (
    <div className="chico suave" style={{ marginTop: 6 }}>
      {lineas.map(({ m, dias }) => (
        <div key={m.id}>
          <strong>{m.nombre}:</strong>{" "}
          {[...dias].sort().map(nombreDiaCorto).join(", ")}
        </div>
      ))}
    </div>
  );
}

/**
 * Matriz día de la semana × modalidad, igual que la hoja «CAPITANES»: quién
 * puede encargarse de qué y qué día.
 */
function MatrizDisponibilidad({
  disp, onCambio,
}: {
  disp: Record<string, number[]>;
  onCambio: (d: Record<string, number[]>) => void;
}) {
  const { db } = useApp();
  const modalidades = db.config.modalidades.filter((m) => m.activa).sort((a, b) => a.orden - b.orden);
  const dias = [1, 2, 3, 4, 5, 6, 0]; // lunes primero, como el rol

  const alternar = (modalidadId: string, dia: number) => {
    const actual = disp[modalidadId] ?? [];
    const siguiente = actual.includes(dia) ? actual.filter((x) => x !== dia) : [...actual, dia];
    onCambio({ ...disp, [modalidadId]: siguiente });
  };

  return (
    <div>
      <h4 className="chico suave">Disponible para encargarse</h4>
      <p className="chico suave" style={{ margin: "2px 0 6px" }}>
        Marca el día y la modalidad. Al armar el rol, esta lista es la que aparece primero.
      </p>
      <div className="desplaza">
        <table className="tabla matriz">
          <thead>
            <tr>
              <th />
              {dias.map((d) => <th key={d} style={{ textAlign: "center" }}>{nombreDiaCorto(d)}</th>)}
            </tr>
          </thead>
          <tbody>
            {modalidades.map((m) => (
              <tr key={m.id}>
                <td><strong className="chico">{m.nombre}</strong></td>
                {dias.map((d) => (
                  <td key={d} style={{ textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={(disp[m.id] ?? []).includes(d)}
                      onChange={() => alternar(m.id, d)}
                      aria-label={`${m.nombre} ${nombreDiaCorto(d)}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EditorPersona({ c, onCerrar }: { c: Partial<Persona>; onCerrar: () => void }) {
  const { acciones } = useApp();
  const [nombre, setNombre] = useState(c.nombre ?? "");
  const [telefono, setTelefono] = useState(c.telefono ?? "");
  const [activo, setActivo] = useState(c.activo ?? true);
  const [esCapitan, setEsCapitan] = useState(c.esCapitan ?? false);
  const [disp, setDisp] = useState<Record<string, number[]>>(c.disponibilidad ?? {});
  const [notas, setNotas] = useState(c.notas ?? "");

  return (
    <Modal
      abierto
      titulo={c.id ? "Editar hermano" : "Nuevo hermano"}
      onCerrar={onCerrar}
      pie={
        <>
          <button className="btn" onClick={onCerrar}>Cancelar</button>
          <button
            className="btn primario"
            disabled={!nombre.trim()}
            onClick={() => {
              acciones.guardarPersona({
                id: c.id,
                nombre: nombre.trim(),
                telefono: telefono.trim() || undefined,
                activo,
                esCapitan,
                disponibilidad: disp,
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
        Nombre
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus
               placeholder="Como debe aparecer en el S-13" />
      </label>
      <label className="campo">
        Teléfono
        <input value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" />
      </label>

      <label className="fila chico">
        <input type="checkbox" checked={esCapitan} onChange={(e) => setEsCapitan(e.target.checked)} />
        Puede dirigir salidas como capitán de grupo
      </label>

      {esCapitan && <MatrizDisponibilidad disp={disp} onCambio={setDisp} />}

      <label className="fila chico">
        <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
        Activo
      </label>
      <label className="campo">
        Notas
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} />
      </label>
    </Modal>
  );
}

/* ----------------------------------------------------------------- puntos */

function Puntos() {
  const { db, acciones } = useApp();
  const [editando, setEditando] = useState<Partial<PuntoReunion> | null>(null);

  return (
    <>
      <div className="fila entre">
        <h2>Puntos de reunión ({db.puntosReunion.length})</h2>
        <button className="btn primario" onClick={() => setEditando({ nombre: "", activo: true })}>
          + Nuevo punto
        </button>
      </div>

      {db.puntosReunion.length === 0 ? (
        <Vacio>Sin puntos de reunión. Agrégalos para incluirlos en el rol.</Vacio>
      ) : (
        <div className="rejilla auto">
          {db.puntosReunion.map((p) => (
            <article key={p.id} className="tarjeta">
              <div className="fila entre">
                <strong>{p.nombre}</strong>
                <Chip color={p.activo ? "#16a34a" : "#94a3b8"}>{p.activo ? "Activo" : "Inactivo"}</Chip>
              </div>
              {p.direccion && <p className="chico suave" style={{ margin: "6px 0 0" }}>{p.direccion}</p>}
              {p.ubicacion && <p className="chico suave" style={{ margin: "6px 0 0" }}>Ubicado en el mapa</p>}
              <div className="fila" style={{ marginTop: 10 }}>
                <button className="btn chico" onClick={() => setEditando(p)}>Editar</button>
                <button
                  className="btn chico peligro"
                  onClick={() => {
                    if (confirmar(`¿Eliminar el punto "${p.nombre}"?`)) acciones.eliminarPunto(p.id);
                  }}
                >
                  Eliminar
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {editando && <EditorPunto p={editando} onCerrar={() => setEditando(null)} />}
    </>
  );
}

function EditorPunto({ p, onCerrar }: { p: Partial<PuntoReunion>; onCerrar: () => void }) {
  const { indice, acciones } = useApp();
  const [nombre, setNombre] = useState(p.nombre ?? "");
  const [direccion, setDireccion] = useState(p.direccion ?? "");
  const [activo, setActivo] = useState(p.activo ?? true);
  const [ubicacion, setUbicacion] = useState<LatLng | undefined>(p.ubicacion);
  const [ubicando, setUbicando] = useState(false);

  return (
    <>
      <Modal
        abierto={!ubicando}
        titulo={p.id ? "Editar punto de reunión" : "Nuevo punto de reunión"}
        onCerrar={onCerrar}
        pie={
          <>
            <button className="btn" onClick={onCerrar}>Cancelar</button>
            <button
              className="btn primario"
              disabled={!nombre.trim()}
              onClick={() => {
                acciones.guardarPunto({
                  id: p.id,
                  nombre: nombre.trim(),
                  direccion: direccion.trim() || undefined,
                  activo,
                  ubicacion,
                  notas: p.notas,
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
          Nombre
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus placeholder="Esquina de Esmeralda y Mármol" />
        </label>
        <label className="campo">
          Dirección o referencia
          <input value={direccion} onChange={(e) => setDireccion(e.target.value)} />
        </label>
        <div className="fila">
          <button className="btn chico" onClick={() => setUbicando(true)}>
            {ubicacion ? "Cambiar ubicación en el mapa" : "Ubicar en el mapa"}
          </button>
          {ubicacion && (
            <>
              <a className="btn chico" href={enlaceMapas(ubicacion)} target="_blank" rel="noreferrer">Ver</a>
              <button className="btn chico fantasma" onClick={() => setUbicacion(undefined)}>Quitar</button>
            </>
          )}
        </div>
        {ubicacion && (
          <p className="chico suave mono" style={{ margin: 0 }}>
            {ubicacion[0].toFixed(5)}, {ubicacion[1].toFixed(5)}
          </p>
        )}
        <label className="fila chico">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
          Activo
        </label>
      </Modal>

      {ubicando && (
        <div style={{ position: "fixed", inset: 0, background: "#fff", zIndex: 50, display: "flex", flexDirection: "column" }}>
          <div className="barra">
            <strong className="crece">Toca en el mapa el lugar exacto de reunión</strong>
            <button className="btn primario" onClick={() => setUbicando(false)}>Listo</button>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <MapaReal
              vistas={indice.todas}
              color={(v) => v.territorio.color}
              capa="calles"
              verNumeros={false}
              marcadores={ubicacion ? [{ latlng: ubicacion, titulo: nombre || "Punto de reunión", tipo: "reunion" }] : []}
              onClicMapa={(ll) => setUbicacion(ll)}
              onCuadra={(v) => setUbicacion(v.cuadra.centroLatLng)}
            />
          </div>
        </div>
      )}
    </>
  );
}

/* --------------------------------------------------------- casas marcadas */

function CasasMarcadas() {
  const { db, acciones } = useApp();
  const [editando, setEditando] = useState<Partial<CasaMarcada> | null>(null);
  const [territorio, setTerritorio] = useState<number | "">("");
  const [soloActivas, setSoloActivas] = useState(true);

  const territorios = useMemo(
    () => [...db.territorios].sort((a, b) => a.id - b.id),
    [db.territorios],
  );

  const lista = useMemo(() => {
    let l = db.casasMarcadas;
    if (soloActivas) l = l.filter((c) => c.activa);
    if (territorio !== "") l = l.filter((c) => c.territorioId === territorio);
    return [...l].sort((a, b) => a.territorioId - b.territorioId || a.direccion.localeCompare(b.direccion, "es"));
  }, [db.casasMarcadas, territorio, soloActivas]);

  const nombreTerritorio = (id: number) => db.territorios.find((t) => t.id === id)?.nombre;

  return (
    <>
      <div className="fila entre">
        <h2>Casas marcadas ({lista.length})</h2>
        <div className="fila">
          <label className="fila chico suave" style={{ gap: 6 }}>
            <input
              type="checkbox"
              checked={soloActivas}
              onChange={(e) => setSoloActivas(e.target.checked)}
            />
            Solo activas
          </label>
          <select
            className="btn"
            value={territorio}
            onChange={(e) => setTerritorio(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Todos los territorios</option>
            {territorios.map((t) => (
              <option key={t.id} value={t.id}>{t.id} · {t.nombre}</option>
            ))}
          </select>
          <button
            className="btn primario"
            onClick={() =>
              setEditando({
                territorioId: territorio !== "" ? territorio : db.territorios[0]?.id,
                direccion: "",
                activa: true,
              })
            }
          >
            + Nueva casa marcada
          </button>
        </div>
      </div>

      <p className="chico suave" style={{ margin: 0 }}>
        Direcciones que no se deben visitar. Se pueden ubicar con un pin exacto en el mapa
        (opcional) para que aparezcan al recorrer el territorio.
      </p>

      {lista.length === 0 ? (
        <Vacio>Sin casas marcadas todavía.</Vacio>
      ) : (
        <div className="tarjeta desplaza">
          <table className="tabla">
            <thead>
              <tr>
                <th>#</th>
                <th>Territorio</th>
                <th>Dirección</th>
                <th>Fecha inicial</th>
                <th>Fecha de visita</th>
                <th>Atendió</th>
                <th>Ubicación</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.map((c, i) => (
                <tr key={c.id}>
                  <td className="mono suave">{i + 1}</td>
                  <td>
                    <strong>{c.territorioId}</strong>{" "}
                    <span className="chico suave">{nombreTerritorio(c.territorioId)}</span>
                  </td>
                  <td>{c.direccion}</td>
                  <td className="chico suave">{c.fechaInicial ? fechaCorta(c.fechaInicial) : "?"}</td>
                  <td className="chico suave">{c.fechaVisita ? fechaCorta(c.fechaVisita) : "—"}</td>
                  <td className="chico suave">{c.atendio || "—"}</td>
                  <td>
                    {c.ubicacion ? (
                      <Chip color="#d03b3b">En el mapa</Chip>
                    ) : (
                      <span className="chico suave">Sin ubicar</span>
                    )}
                  </td>
                  <td>
                    <div className="fila" style={{ gap: 4 }}>
                      <button className="btn chico" onClick={() => setEditando(c)}>Editar</button>
                      <button
                        className="btn chico peligro"
                        onClick={() => {
                          if (confirmar(`¿Eliminar la casa marcada "${c.direccion}"?`)) {
                            acciones.eliminarCasaMarcada(c.id);
                          }
                        }}
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editando && <EditorCasaMarcada c={editando} onCerrar={() => setEditando(null)} />}
    </>
  );
}

function EditorCasaMarcada({ c, onCerrar }: { c: Partial<CasaMarcada>; onCerrar: () => void }) {
  const { db, indice, acciones } = useApp();
  const territorios = useMemo(() => [...db.territorios].sort((a, b) => a.id - b.id), [db.territorios]);

  const [territorioId, setTerritorioId] = useState<number>(c.territorioId ?? territorios[0]?.id ?? 0);
  const [direccion, setDireccion] = useState(c.direccion ?? "");
  const [fechaInicial, setFechaInicial] = useState(c.fechaInicial ?? "");
  const [fechaVisita, setFechaVisita] = useState(c.fechaVisita ?? "");
  const [atendio, setAtendio] = useState(c.atendio ?? "");
  const [activa, setActiva] = useState(c.activa ?? true);
  const [notas, setNotas] = useState(c.notas ?? "");
  const [ubicacion, setUbicacion] = useState<LatLng | undefined>(c.ubicacion);
  const [ubicando, setUbicando] = useState(false);

  return (
    <>
      <Modal
        abierto={!ubicando}
        titulo={c.id ? "Editar casa marcada" : "Nueva casa marcada"}
        onCerrar={onCerrar}
        pie={
          <>
            <button className="btn" onClick={onCerrar}>Cancelar</button>
            <button
              className="btn primario"
              disabled={!direccion.trim() || !territorioId}
              onClick={() => {
                acciones.guardarCasaMarcada({
                  id: c.id,
                  territorioId,
                  direccion: direccion.trim(),
                  fechaInicial: fechaInicial || undefined,
                  fechaVisita: fechaVisita || undefined,
                  atendio: atendio.trim() || undefined,
                  activa,
                  ubicacion,
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
        <div className="rejilla" style={{ gridTemplateColumns: "1fr 2fr", gap: 10 }}>
          <label className="campo">
            Territorio
            <select
              value={territorioId}
              onChange={(e) => setTerritorioId(Number(e.target.value))}
            >
              {territorios.map((t) => (
                <option key={t.id} value={t.id}>{t.id} · {t.nombre}</option>
              ))}
            </select>
          </label>
          <label className="campo">
            Dirección
            <input value={direccion} onChange={(e) => setDireccion(e.target.value)} autoFocus />
          </label>
        </div>

        <div className="rejilla" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label className="campo">
            Fecha inicial
            <input type="date" value={fechaInicial} onChange={(e) => setFechaInicial(e.target.value)} />
          </label>
          <label className="campo">
            Fecha de visita
            <input type="date" value={fechaVisita} onChange={(e) => setFechaVisita(e.target.value)} />
          </label>
        </div>

        <label className="campo">
          Atendió
          <input value={atendio} onChange={(e) => setAtendio(e.target.value)} placeholder="Quién hizo la última revisión" />
        </label>

        <div className="fila">
          <button className="btn chico" onClick={() => setUbicando(true)}>
            {ubicacion ? "Cambiar ubicación en el mapa" : "Ubicar en el mapa"}
          </button>
          {ubicacion && (
            <>
              <a className="btn chico" href={enlaceMapas(ubicacion)} target="_blank" rel="noreferrer">Ver</a>
              <button className="btn chico fantasma" onClick={() => setUbicacion(undefined)}>Quitar</button>
            </>
          )}
        </div>
        {ubicacion && (
          <p className="chico suave mono" style={{ margin: 0 }}>
            {ubicacion[0].toFixed(5)}, {ubicacion[1].toFixed(5)}
          </p>
        )}

        <label className="fila chico">
          <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} />
          Marca activa (sigue vigente)
        </label>

        <label className="campo">
          Notas
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} />
        </label>
      </Modal>

      {ubicando && (
        <div style={{ position: "fixed", inset: 0, background: "#fff", zIndex: 50, display: "flex", flexDirection: "column" }}>
          <div className="barra">
            <strong className="crece">Toca en el mapa la casa marcada</strong>
            <button className="btn primario" onClick={() => setUbicando(false)}>Listo</button>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <MapaReal
              vistas={indice.todas}
              color={(v) => v.territorio.color}
              capa="calles"
              verNumeros={false}
              marcadores={ubicacion ? [{ latlng: ubicacion, titulo: direccion || "Casa marcada", tipo: "marcada" }] : []}
              onClicMapa={(ll) => setUbicacion(ll)}
              onCuadra={(v) => setUbicacion(v.cuadra.centroLatLng)}
            />
          </div>
        </div>
      )}
    </>
  );
}
