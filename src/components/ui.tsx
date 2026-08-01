import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export function Modal({
  abierto, titulo, onCerrar, children, pie,
}: {
  abierto: boolean;
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
  pie?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);

  return (
    <dialog className="modal" ref={ref} onCancel={(e) => { e.preventDefault(); onCerrar(); }}>
      <header>
        <h3 className="crece">{titulo}</h3>
        <button className="btn fantasma" type="button" onClick={onCerrar} aria-label="Cerrar">✕</button>
      </header>
      <div className="cuerpo">{children}</div>
      {pie && <footer>{pie}</footer>}
    </dialog>
  );
}

export function Metrica({
  valor, nombre, pie, color,
}: {
  valor: ReactNode;
  nombre: string;
  pie?: ReactNode;
  color?: string;
}) {
  return (
    <div className="tarjeta metrica">
      <span className="nombre">{nombre}</span>
      <span className="valor" style={color ? { color } : undefined}>{valor}</span>
      {pie && <span className="pie">{pie}</span>}
    </div>
  );
}

export function BarraAvance({ valor, color }: { valor: number; color?: string }) {
  return (
    <div className="barra-avance" role="progressbar" aria-valuenow={Math.round(valor * 100)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.max(0, Math.min(1, valor)) * 100}%`, background: color }} />
    </div>
  );
}

export function Chip({ color, children }: { color?: string; children: ReactNode }) {
  return (
    <span className="etiqueta">
      {color && <i className="punto" style={{ background: color }} />}
      {children}
    </span>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return <div className="vacio">{children}</div>;
}

/** Confirmación explícita para acciones que borran datos. */
export function confirmar(mensaje: string): boolean {
  return window.confirm(mensaje);
}
