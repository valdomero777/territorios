import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Qué parte de la app se está protegiendo, para el mensaje. */
  zona: string;
  /**
   * Marca el límite que envuelve TODA la app. Si falla aquí no queda interfaz
   * detrás, así que se ofrece la salida de emergencia: borrar los datos locales.
   */
  raiz?: boolean;
}

interface Estado {
  error: Error | null;
}

/**
 * Un fallo aislado (por ejemplo el mapa sin conexión) no debe dejar la pantalla
 * en blanco: el resto de la app tiene que seguir sirviendo en la calle.
 */
export class LimiteError extends Component<Props, Estado> {
  state: Estado = { error: null };

  static getDerivedStateFromError(error: Error): Estado {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.zona}]`, error, info.componentStack);
  }

  private borrarDatos = () => {
    if (
      !window.confirm(
        "Se borrarán los datos guardados en ESTE navegador (registros, jornadas, capitanes) " +
          "y la app volverá a arrancar limpia. Si tienes un respaldo, podrás importarlo después. " +
          "¿Continuar?",
      )
    ) {
      return;
    }
    try {
      localStorage.removeItem("servicio-territorios/db");
    } catch {
      /* si el navegador bloquea el almacenamiento, recargar es lo único que queda */
    }
    location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    const mensaje = this.state.error.message;

    if (this.props.raiz) {
      return (
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
          <div className="tarjeta" style={{ maxWidth: 560, borderColor: "#fca5a5", background: "#fef2f2" }}>
            <h2>La aplicación no pudo arrancar</h2>
            <p className="chico suave">
              Casi siempre es porque los datos guardados en este navegador vienen de una versión
              anterior. Primero intenta recargar; si sigue igual, borra los datos locales.
            </p>
            <pre className="chico" style={{ whiteSpace: "pre-wrap", overflowX: "auto", margin: "10px 0" }}>
              {mensaje}
            </pre>
            <div className="fila">
              <button className="btn primario" onClick={() => location.reload()}>Recargar</button>
              <button className="btn peligro" onClick={this.borrarDatos}>Borrar datos locales</button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="tarjeta" style={{ margin: 14, borderColor: "#fca5a5", background: "#fef2f2" }}>
        <h3>No se pudo mostrar {this.props.zona}</h3>
        <p className="chico suave">
          El resto de la aplicación sigue funcionando. Si estás sin señal, cambia el fondo del mapa
          a «Sin fondo».
        </p>
        <pre className="chico" style={{ whiteSpace: "pre-wrap", overflowX: "auto", margin: "8px 0" }}>
          {mensaje}
        </pre>
        <button className="btn" onClick={() => this.setState({ error: null })}>
          Reintentar
        </button>
      </div>
    );
  }
}
