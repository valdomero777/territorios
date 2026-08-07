import { useState } from "react";
import { PuertaAcceso } from "./components/PuertaAcceso";
import { ProveedorApp, useApp } from "./hooks/useApp";
import { VistaHoy } from "./views/VistaHoy";
import { VistaMapa } from "./views/VistaMapa";
import { VistaTerritorios } from "./views/VistaTerritorios";
import { VistaRol } from "./views/VistaRol";
import { VistaMetricas } from "./views/VistaMetricas";
import { VistaCatalogos } from "./views/VistaCatalogos";
import { VistaAjustes } from "./views/VistaAjustes";
import { BarraAvance } from "./components/ui";
import { LimiteError } from "./components/LimiteError";

type Vista =
  | "hoy" | "mapa" | "territorios" | "rol" | "metricas" | "catalogos" | "ajustes";

const PESTANAS: { clave: Vista; nombre: string }[] = [
  { clave: "hoy", nombre: "Hoy" },
  { clave: "mapa", nombre: "Mapa" },
  { clave: "territorios", nombre: "Territorios" },
  { clave: "rol", nombre: "Rol mensual" },
  { clave: "metricas", nombre: "Métricas" },
  { clave: "catalogos", nombre: "Catálogos" },
  { clave: "ajustes", nombre: "Ajustes" },
];

function Interfaz() {
  const { db, global, ciclo, nubeFallando } = useApp();
  const [vista, setVista] = useState<Vista>("hoy");

  return (
    <div className="app">
      <div className="barra">
        <div className="marca">
          <h1>Territorios · {db.config.nombreCongregacion}</h1>
          <small>
            {ciclo ? `${ciclo.nombre} · ` : ""}
            {global.trabajadas} de {global.totalCuadras} cuadras · {Math.round(global.avance * 100)}%
          </small>
        </div>
        <div style={{ width: 160 }}>
          <BarraAvance valor={global.avance} />
        </div>
      </div>

      {nubeFallando && (
        <div className="aviso-nube">
          ⚠ La nube no está respondiendo ahora mismo (puede ser la cuota de Firebase). Tus cambios se
          siguen guardando en este dispositivo y se sincronizarán solos en cuanto se recupere — mientras
          tanto, exporta un respaldo en Ajustes si vas a cambiar de dispositivo.
        </div>
      )}

      <nav className="nav">
        {PESTANAS.map((p) => (
          <button
            key={p.clave}
            onClick={() => setVista(p.clave)}
            aria-current={vista === p.clave ? "page" : undefined}
          >
            {p.nombre}
          </button>
        ))}
      </nav>

      <main className={`contenido${vista === "mapa" ? " sin-relleno" : ""}`}>
        <LimiteError zona={PESTANAS.find((p) => p.clave === vista)?.nombre ?? "esta pantalla"}>
          {vista === "hoy" && <VistaHoy />}
          {vista === "mapa" && <VistaMapa />}
          {vista === "territorios" && <VistaTerritorios />}
          {vista === "rol" && <VistaRol />}
          {vista === "metricas" && <VistaMetricas />}
          {vista === "catalogos" && <VistaCatalogos />}
          {vista === "ajustes" && <VistaAjustes />}
        </LimiteError>
      </main>
    </div>
  );
}

export default function App() {
  // El límite va POR FUERA del proveedor: si lo que falla es la carga o migración
  // de los datos guardados, no hay interfaz detrás y la pantalla quedaría en
  // blanco, sin siquiera el menú para llegar a Ajustes.
  return (
    <LimiteError zona="la aplicación" raiz>
      <PuertaAcceso>
        <ProveedorApp>
          <Interfaz />
        </ProveedorApp>
      </PuertaAcceso>
    </LimiteError>
  );
}
