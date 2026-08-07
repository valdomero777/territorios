import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import type { ReactNode } from "react";
import { crearRepo } from "../data/repo";
import { aplicarGeometriaEditada, baseInicial, cicloAbierto, migrar, nuevoId } from "../domain/db";
import { construirIndice, resumenGlobal, resumenesTerritorio } from "../domain/estado";
import type { Indice, ResumenGlobal, ResumenTerritorio } from "../domain/estado";
import { hoy, sumarDias } from "../domain/fechas";
import { anioServicioDe } from "../domain/s13";
import type {
  AsignacionTerritorio, BaseDatos, Ciclo, Config, Cuadra, Fecha, Jornada, LatLng, Persona,
  PuntoReunion, Registro, Territorio,
} from "../domain/tipos";

interface Acciones {
  guardarConfig(cambios: Partial<Config>): void;

  guardarTerritorio(id: number, cambios: Partial<Omit<Territorio, "cuadras">>): void;
  guardarCuadra(territorioId: number, cuadraId: string, cambios: Partial<Cuadra>): void;
  moverCuadra(cuadraId: string, destinoId: number, nuevaLetra?: string): void;

  /** Corrige a mano la forma de una cuadra (arrastrando vértices en el Mapa). */
  guardarFormaCuadra(cuadraId: string, anillo: LatLng[]): void;
  /** Vuelve a la geometría del mapa base para esa cuadra. */
  restablecerFormaCuadra(cuadraId: string): void;
  /** Vacía el borrador completo, típicamente tras exportar y reemplazar mapa.json. */
  limpiarBorradorGeometria(): void;

  guardarPersona(p: Omit<Persona, "id"> & { id?: string }): void;
  eliminarPersona(id: string): void;

  /** Entrega un territorio completo a una persona (renglón del S-13). */
  asignarTerritorio(datos: {
    territorioId: number;
    personaId: string;
    fechaAsignacion: Fecha;
    notas?: string;
  }): string;
  /**
   * Cierra la asignación. Si `registrarCuadras` va en verdadero, además asienta
   * en la bitácora las cuadras del territorio con esa fecha, para que el mapa y
   * el S-13 cuenten lo mismo.
   */
  completarAsignacion(id: string, fechaCompletado: Fecha, registrarCuadras: boolean): void;
  reabrirAsignacion(id: string): void;
  guardarAsignacion(a: AsignacionTerritorio): void;
  eliminarAsignacion(id: string): void;

  guardarPunto(p: Omit<PuntoReunion, "id"> & { id?: string }): void;
  eliminarPunto(id: string): void;

  guardarJornada(j: Omit<Jornada, "id" | "creada"> & { id?: string }): string;
  eliminarJornada(id: string): void;

  guardarEvento(fecha: Fecha, texto: string): void;
  eliminarEvento(id: string): void;
  /** Duplica el rol de un mes en otro, para no volver a teclear el patrón. */
  copiarRol(mesOrigen: string, mesDestino: string): number;

  registrarTrabajo(cuadraIds: string[], datos?: Partial<Registro>): void;
  eliminarRegistro(id: string): void;

  cerrarCiclo(nombreNuevo?: string): void;

  reemplazarBase(db: BaseDatos): void;
  reiniciar(): void;
}

interface AppCtx {
  db: BaseDatos;
  indice: Indice;
  resumenes: ResumenTerritorio[];
  global: ResumenGlobal;
  ciclo: Ciclo | null;
  repoNombre: string;
  /** `true` si la nube dejó de responder (cuota agotada, sin señal…) y los
   *  cambios están quedando solo en este dispositivo por ahora. */
  nubeFallando: boolean;
  acciones: Acciones;
}

const Ctx = createContext<AppCtx | null>(null);

export function ProveedorApp({ children }: { children: ReactNode }) {
  const repo = useMemo(() => crearRepo(), []);
  const [db, setDb] = useState<BaseDatos | null>(null);
  const dbRef = useRef<BaseDatos | null>(null);
  const [nubeFallando, setNubeFallando] = useState(false);
  const nubeFallandoRef = useRef(false);

  useEffect(() => {
    if (!repo.estadoNube) return;
    return repo.estadoNube((fallando) => {
      nubeFallandoRef.current = fallando;
      setNubeFallando(fallando);
    });
  }, [repo]);

  useEffect(() => {
    let vivo = true;
    repo.cargar().then((cargada) => {
      if (!vivo) return;
      let inicial: BaseDatos;
      try {
        inicial = cargada ? migrar(cargada) : baseInicial();
      } catch (e) {
        // Datos de una versión vieja o corruptos: se apartan sin borrarlos y la
        // app arranca limpia. Antes esto dejaba la pantalla completamente vacía.
        console.error("No se pudieron leer los datos guardados; se apartaron.", e);
        try {
          localStorage.setItem(
            `servicio-territorios/db-ilegible-${Date.now()}`,
            JSON.stringify(cargada),
          );
        } catch {
          /* sin espacio para el respaldo: seguimos de todos modos */
        }
        inicial = baseInicial();
      }
      dbRef.current = inicial;
      setDb(inicial);
      // Se guarda siempre el resultado de la migración: si no, el dato viejo se
      // queda en el navegador y hay que volver a migrarlo en cada arranque.
      void repo.guardar(inicial);
    });
    const cancelar = repo.suscribir((remota) => {
      // Mientras la nube está fallando, lo que llegue aquí puede ser la copia
      // vieja de antes de la falla (Firestore la sirve de su caché local sin
      // avisar que está corriendo atrás) — aplicarla pisaría cambios que ya
      // se hicieron en este dispositivo y que solo viven en el respaldo local.
      if (nubeFallandoRef.current) return;
      const m = migrar(remota);
      dbRef.current = m;
      setDb(m);
    });
    return () => {
      vivo = false;
      cancelar();
    };
  }, [repo]);

  /** Única puerta de escritura: aplica el cambio, persiste y re-renderiza. */
  const actualizar = useCallback(
    (fn: (previa: BaseDatos) => BaseDatos) => {
      const previa = dbRef.current;
      if (!previa) return;
      const siguiente = fn(previa);
      dbRef.current = siguiente;
      setDb(siguiente);
      void repo.guardar(siguiente);
    },
    [repo],
  );

  const acciones = useMemo<Acciones>(() => {
    const conCiclo = (d: BaseDatos) => cicloAbierto(d)?.id ?? d.ciclos[0]?.id ?? "";

    return {
      guardarConfig: (cambios) =>
        actualizar((d) => ({ ...d, config: { ...d.config, ...cambios } })),

      guardarTerritorio: (id, cambios) =>
        actualizar((d) => ({
          ...d,
          territorios: d.territorios.map((t) => (t.id === id ? { ...t, ...cambios } : t)),
        })),

      guardarCuadra: (territorioId, cuadraId, cambios) =>
        actualizar((d) => ({
          ...d,
          territorios: d.territorios.map((t) =>
            t.id !== territorioId
              ? t
              : {
                  ...t,
                  cuadras: t.cuadras.map((c) => (c.id === cuadraId ? { ...c, ...cambios } : c)),
                },
          ),
        })),

      moverCuadra: (cuadraId, destinoId, nuevaLetra) =>
        actualizar((d) => {
          const origen = d.territorios.find((t) => t.cuadras.some((c) => c.id === cuadraId));
          const destino = d.territorios.find((t) => t.id === destinoId);
          if (!origen || !destino || origen.id === destino.id) return d;
          const cuadra = origen.cuadras.find((c) => c.id === cuadraId)!;
          const usadas = new Set(destino.cuadras.map((c) => c.letra));
          const letra =
            nuevaLetra ??
            (usadas.has(cuadra.letra)
              ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").find((l) => !usadas.has(l)) ?? cuadra.letra
              : cuadra.letra);
          const nuevoIdCuadra = `${destino.id}-${letra}`;
          return {
            ...d,
            territorios: d.territorios.map((t) => {
              if (t.id === origen.id) {
                return { ...t, cuadras: t.cuadras.filter((c) => c.id !== cuadraId) };
              }
              if (t.id === destino.id) {
                return {
                  ...t,
                  // `origen` no cambia: es lo que ata la cuadra a su geometría
                  // en el mapa base aunque cambie de territorio.
                  cuadras: [...t.cuadras, { ...cuadra, id: nuevoIdCuadra, letra }].sort((a, b) =>
                    a.letra.localeCompare(b.letra, "es"),
                  ),
                };
              }
              return t;
            }),
            // La bitácora sigue a la cuadra: el historial no se pierde al reorganizar.
            registros: d.registros.map((r) =>
              r.cuadraId === cuadraId ? { ...r, cuadraId: nuevoIdCuadra } : r,
            ),
            // El borrador de forma también sigue a la cuadra, si tenía una.
            geometriaEditada:
              cuadraId in d.geometriaEditada
                ? Object.fromEntries(
                    Object.entries(d.geometriaEditada).map(([id, anillo]) =>
                      id === cuadraId ? [nuevoIdCuadra, anillo] : [id, anillo],
                    ),
                  )
                : d.geometriaEditada,
          };
        }),

      guardarFormaCuadra: (cuadraId, anillo) =>
        actualizar((d) => {
          const geometriaEditada = { ...d.geometriaEditada, [cuadraId]: anillo };
          return {
            ...d,
            geometriaEditada,
            territorios: aplicarGeometriaEditada(d.territorios, { [cuadraId]: anillo }),
          };
        }),

      restablecerFormaCuadra: (cuadraId) =>
        actualizar((d) => {
          if (!(cuadraId in d.geometriaEditada)) return d;
          const geometriaEditada = { ...d.geometriaEditada };
          delete geometriaEditada[cuadraId];
          // La geometría base se indexa por `origen` (no cambia si la cuadra se
          // movió de territorio), así que hay que resolverlo primero.
          const actual = d.territorios.flatMap((t) => t.cuadras).find((c) => c.id === cuadraId);
          const origen = actual?.origen ?? cuadraId;
          const original = baseInicial()
            .territorios.flatMap((t) => t.cuadras)
            .find((c) => c.origen === origen);
          if (!original) return { ...d, geometriaEditada };
          return {
            ...d,
            geometriaEditada,
            territorios: d.territorios.map((t) => ({
              ...t,
              cuadras: t.cuadras.map((c) =>
                c.id === cuadraId
                  ? { ...c, latlng: original.latlng, centroLatLng: original.centroLatLng, areaM2: original.areaM2 }
                  : c,
              ),
            })),
          };
        }),

      limpiarBorradorGeometria: () => actualizar((d) => ({ ...d, geometriaEditada: {} })),

      guardarPersona: (p) =>
        actualizar((d) => {
          if (p.id && d.personas.some((x) => x.id === p.id)) {
            return {
              ...d,
              personas: d.personas.map((x) => (x.id === p.id ? { ...x, ...p, id: p.id! } : x)),
            };
          }
          return { ...d, personas: [...d.personas, { ...p, id: p.id ?? nuevoId("per") }] };
        }),

      eliminarPersona: (id) =>
        actualizar((d) => ({
          ...d,
          personas: d.personas.filter((p) => p.id !== id),
          jornadas: d.jornadas.map((j) => (j.capitanId === id ? { ...j, capitanId: null } : j)),
        })),

      asignarTerritorio: ({ territorioId, personaId, fechaAsignacion, notas }) => {
        const id = nuevoId("asig");
        actualizar((d) => {
          // Un territorio no puede estar en dos manos a la vez: si había una
          // asignación abierta, se cierra el día anterior a la nueva entrega.
          const abierta = d.asignaciones.find(
            (a) => a.territorioId === territorioId && a.fechaCompletado === null,
          );
          const asignaciones = abierta
            ? d.asignaciones.map((a) =>
                a.id === abierta.id
                  ? { ...a, fechaCompletado: sumarDias(fechaAsignacion, -1) }
                  : a,
              )
            : d.asignaciones;
          return {
            ...d,
            asignaciones: [
              ...asignaciones,
              {
                id,
                territorioId,
                personaId,
                fechaAsignacion,
                fechaCompletado: null,
                anioServicio: anioServicioDe(fechaAsignacion),
                notas,
                creada: new Date().toISOString(),
              },
            ],
          };
        });
        return id;
      },

      completarAsignacion: (id, fechaCompletado, registrarCuadras) =>
        actualizar((d) => {
          const a = d.asignaciones.find((x) => x.id === id);
          if (!a) return d;
          const asignaciones = d.asignaciones.map((x) =>
            x.id === id ? { ...x, fechaCompletado } : x,
          );
          if (!registrarCuadras) return { ...d, asignaciones };

          const territorio = d.territorios.find((t) => t.id === a.territorioId);
          const ciclo = conCiclo(d);
          const ahora = new Date().toISOString();
          const yaEnCiclo = new Set(
            d.registros.filter((r) => r.cicloId === ciclo).map((r) => r.cuadraId),
          );
          const nuevos: Registro[] = (territorio?.cuadras ?? [])
            .filter((c) => c.activa && !yaEnCiclo.has(c.id))
            .map((c) => ({
              id: nuevoId("reg"),
              cuadraId: c.id,
              fecha: fechaCompletado,
              cicloId: ciclo,
              capitanId: a.personaId,
              asignacionId: id,
              creado: ahora,
            }));
          return { ...d, asignaciones, registros: [...d.registros, ...nuevos] };
        }),

      reabrirAsignacion: (id) =>
        actualizar((d) => ({
          ...d,
          asignaciones: d.asignaciones.map((a) =>
            a.id === id ? { ...a, fechaCompletado: null } : a,
          ),
          // Se retiran los registros que generó el cierre; los capturados a mano
          // en el mapa se quedan.
          registros: d.registros.filter((r) => r.asignacionId !== id),
        })),

      guardarAsignacion: (a) =>
        actualizar((d) => ({
          ...d,
          asignaciones: d.asignaciones.map((x) =>
            x.id === a.id ? { ...a, anioServicio: anioServicioDe(a.fechaAsignacion) } : x,
          ),
        })),

      eliminarAsignacion: (id) =>
        actualizar((d) => ({
          ...d,
          asignaciones: d.asignaciones.filter((a) => a.id !== id),
          registros: d.registros.filter((r) => r.asignacionId !== id),
        })),

      guardarPunto: (p) =>
        actualizar((d) => {
          if (p.id && d.puntosReunion.some((x) => x.id === p.id)) {
            return {
              ...d,
              puntosReunion: d.puntosReunion.map((x) =>
                x.id === p.id ? { ...x, ...p, id: p.id! } : x,
              ),
            };
          }
          return {
            ...d,
            puntosReunion: [...d.puntosReunion, { ...p, id: p.id ?? nuevoId("pto") }],
          };
        }),

      eliminarPunto: (id) =>
        actualizar((d) => ({
          ...d,
          puntosReunion: d.puntosReunion.filter((p) => p.id !== id),
        })),

      guardarJornada: (j) => {
        const id = j.id ?? nuevoId("jor");
        actualizar((d) => {
          const existente = d.jornadas.find((x) => x.id === id);
          if (existente) {
            return {
              ...d,
              jornadas: d.jornadas.map((x) => (x.id === id ? { ...x, ...j, id } : x)),
            };
          }
          const nueva: Jornada = { ...j, id, creada: new Date().toISOString() };
          return { ...d, jornadas: [...d.jornadas, nueva] };
        });
        return id;
      },

      eliminarJornada: (id) =>
        actualizar((d) => ({
          ...d,
          jornadas: d.jornadas.filter((j) => j.id !== id),
        })),

      guardarEvento: (fecha, texto) =>
        actualizar((d) => {
          const limpio = texto.trim();
          const previo = d.eventos.find((e) => e.fecha === fecha);
          if (!limpio) {
            return { ...d, eventos: d.eventos.filter((e) => e.fecha !== fecha) };
          }
          if (previo) {
            return {
              ...d,
              eventos: d.eventos.map((e) => (e.fecha === fecha ? { ...e, texto: limpio } : e)),
            };
          }
          return { ...d, eventos: [...d.eventos, { id: nuevoId("evt"), fecha, texto: limpio }] };
        }),

      eliminarEvento: (id) =>
        actualizar((d) => ({ ...d, eventos: d.eventos.filter((e) => e.id !== id) })),

      copiarRol: (mesOrigen, mesDestino) => {
        let copiadas = 0;
        actualizar((d) => {
          const origen = d.jornadas.filter((j) => j.fecha.startsWith(mesOrigen));
          if (!origen.length) return d;

          const [aO, mO] = mesOrigen.split("-").map(Number);
          const [aD, mD] = mesDestino.split("-").map(Number);
          const diasDestino = new Date(aD, mD, 0).getDate();
          const yaHay = new Set(
            d.jornadas.filter((j) => j.fecha.startsWith(mesDestino)).map((j) => `${j.fecha}|${j.modalidadId}`),
          );

          const nuevas: Jornada[] = [];
          for (const j of origen) {
            // Se conserva el día de la semana, que es lo que ordena el patrón:
            // el mismo enésimo día de semana del mes destino.
            const orig = new Date(aO, mO - 1, Number(j.fecha.slice(8)));
            const diaSem = orig.getDay();
            const semana = Math.floor((orig.getDate() - 1) / 7);
            const primero = new Date(aD, mD - 1, 1);
            const desfase = (diaSem - primero.getDay() + 7) % 7;
            const dia = 1 + desfase + semana * 7;
            if (dia > diasDestino) continue;
            const fecha = `${mesDestino}-${String(dia).padStart(2, "0")}`;
            if (yaHay.has(`${fecha}|${j.modalidadId}`)) continue;
            yaHay.add(`${fecha}|${j.modalidadId}`);
            nuevas.push({
              ...j,
              id: nuevoId("jor"),
              fecha,
              creada: new Date().toISOString(),
            });
            copiadas += 1;
          }
          return { ...d, jornadas: [...d.jornadas, ...nuevas] };
        });
        return copiadas;
      },

      registrarTrabajo: (cuadraIds, datos) =>
        actualizar((d) => {
          const ciclo = conCiclo(d);
          const ahora = new Date().toISOString();
          const nuevos: Registro[] = cuadraIds.map((cuadraId) => ({
            id: nuevoId("reg"),
            cuadraId,
            fecha: datos?.fecha ?? hoy(),
            cicloId: ciclo,
            capitanId: datos?.capitanId,
            notas: datos?.notas,
            creado: ahora,
          }));
          return { ...d, registros: [...d.registros, ...nuevos] };
        }),

      eliminarRegistro: (id) =>
        actualizar((d) => ({ ...d, registros: d.registros.filter((r) => r.id !== id) })),

      cerrarCiclo: (nombreNuevo) =>
        actualizar((d) => {
          const abierto = cicloAbierto(d);
          const fecha = hoy();
          const numero = d.ciclos.length + 1;
          const nuevo: Ciclo = {
            id: nuevoId("ciclo"),
            nombre: nombreNuevo?.trim() || `Ciclo ${numero}`,
            inicio: fecha,
            fin: null,
          };
          return {
            ...d,
            ciclos: [
              ...d.ciclos.map((c) => (abierto && c.id === abierto.id ? { ...c, fin: fecha } : c)),
              nuevo,
            ],
          };
        }),

      reemplazarBase: (nueva) => actualizar(() => migrar(nueva)),

      reiniciar: () => actualizar(() => baseInicial()),
    };
  }, [actualizar]);

  const valor = useMemo<AppCtx | null>(() => {
    if (!db) return null;
    const indice = construirIndice(db);
    const resumenes = resumenesTerritorio(db, indice);
    return {
      db,
      indice,
      resumenes,
      global: resumenGlobal(indice, resumenes),
      ciclo: cicloAbierto(db),
      repoNombre: repo.nombre,
      nubeFallando,
      acciones,
    };
  }, [db, acciones, repo, nubeFallando]);

  if (!valor) {
    return <div className="cargando">Cargando el territorio…</div>;
  }
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useApp(): AppCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp debe usarse dentro de <ProveedorApp>");
  return v;
}
