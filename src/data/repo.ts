/**
 * Capa de datos aislada.
 *
 * Toda la app habla ÚNICAMENTE con esta interfaz. Hoy la implementa
 * `repoLocal.ts` (localStorage). Mañana, para trabajar en conjunto con los
 * auxiliares, basta con escribir un `repoFirebase.ts` que cumpla el mismo
 * contrato y cambiar una línea en `crearRepo()`. Ningún componente cambia.
 */

import type { BaseDatos } from "../domain/tipos";

export interface Repo {
  /** Nombre corto de la implementación, para mostrar en Ajustes. */
  readonly nombre: string;
  /** Carga el estado completo. Devuelve null si nunca se ha guardado nada. */
  cargar(): Promise<BaseDatos | null>;
  /** Guarda el estado completo. */
  guardar(db: BaseDatos): Promise<void>;
  /**
   * Notifica cambios hechos desde otra pestaña o dispositivo.
   * Devuelve una función para cancelar la suscripción.
   */
  suscribir(cb: (db: BaseDatos) => void): () => void;
  /**
   * Avisa cuando guardar en la nube deja de funcionar (cuota agotada, sin
   * conexión con el servidor, etc.) y cuando se recupera. Los repos que
   * siempre guardan localmente (como `RepoLocal`) no necesitan implementarlo:
   * por omisión se asume que todo va bien.
   */
  estadoNube?(cb: (fallando: boolean) => void): () => void;
}

import { CONFIGURADO } from "./firebase";
import { RepoFirebase } from "./repoFirebase";
import { RepoLocal } from "./repoLocal";

export function crearRepo(): Repo {
  return CONFIGURADO ? new RepoFirebase() : new RepoLocal();
}
