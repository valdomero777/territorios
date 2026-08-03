import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import type { User } from "firebase/auth";
import { auth, CONFIGURADO, CORREO_COMPARTIDO } from "../data/firebase";

/**
 * Filtro de acceso para el modo compartido: no hay cuentas por persona, solo
 * una clave que se reparte con el grupo (es la contraseña de la única cuenta
 * de Firebase Auth que existe en el proyecto — ver README). Si Firebase no
 * está configurado (desarrollo local sin `.env.local`) deja pasar directo,
 * igual que siempre.
 */
export function PuertaAcceso({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<User | null | undefined>(CONFIGURADO ? undefined : null);

  useEffect(() => {
    if (!CONFIGURADO || !auth) return;
    return onAuthStateChanged(auth, setUsuario);
  }, []);

  if (!CONFIGURADO) return <>{children}</>;
  if (usuario === undefined) return <div className="cargando">Cargando…</div>;
  if (!usuario) return <FormularioClave />;
  return <>{children}</>;
}

function FormularioClave() {
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  const entrar = async (e: FormEvent) => {
    e.preventDefault();
    if (!auth) return;
    setError(null);
    setEntrando(true);
    try {
      await signInWithEmailAndPassword(auth, CORREO_COMPARTIDO, clave);
    } catch {
      setError("Clave incorrecta.");
    } finally {
      setEntrando(false);
    }
  };

  return (
    <div className="fila" style={{ minHeight: "100dvh", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <form onSubmit={entrar} className="tarjeta rejilla" style={{ gap: 12, width: "100%", maxWidth: 340 }}>
        <h2 style={{ margin: 0 }}>Territorios</h2>
        <p className="chico suave" style={{ margin: 0 }}>
          Ingresa la clave del grupo para entrar.
        </p>
        <label className="campo">
          Clave
          <input
            type="password"
            autoFocus
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            placeholder="••••••••"
          />
        </label>
        {error && <p className="chico" style={{ color: "#dc2626", margin: 0 }}>{error}</p>}
        <button className="btn primario" type="submit" disabled={entrando || !clave}>
          {entrando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}

export async function cerrarSesion(): Promise<void> {
  if (auth) await signOut(auth);
}
