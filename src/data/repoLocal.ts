import type { Repo } from "./repo";
import type { BaseDatos } from "../domain/tipos";

const CLAVE = "servicio-territorios/db";

/**
 * Persistencia en el navegador. Sincroniza entre pestañas del mismo equipo
 * mediante el evento `storage`, pero NO entre dispositivos: para eso está
 * el respaldo JSON de Ajustes, o la futura implementación con Firebase.
 */
export class RepoLocal implements Repo {
  readonly nombre = "Este dispositivo (navegador)";

  async cargar(): Promise<BaseDatos | null> {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return null;
    try {
      return JSON.parse(crudo) as BaseDatos;
    } catch {
      // Copia el dato corrupto a un lado en vez de perderlo en silencio.
      localStorage.setItem(`${CLAVE}/corrupto-${Date.now()}`, crudo);
      return null;
    }
  }

  async guardar(db: BaseDatos): Promise<void> {
    localStorage.setItem(CLAVE, JSON.stringify(db));
  }

  suscribir(cb: (db: BaseDatos) => void): () => void {
    const manejar = (e: StorageEvent) => {
      if (e.key !== CLAVE || !e.newValue) return;
      try {
        cb(JSON.parse(e.newValue) as BaseDatos);
      } catch {
        /* ignora escrituras corruptas de otra pestaña */
      }
    };
    window.addEventListener("storage", manejar);
    return () => window.removeEventListener("storage", manejar);
  }
}
