import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Uso sin conexión: los capitanes abren la app en la calle, donde la señal falla.
// Solo en producción, para no pelear con el recargado en caliente de Vite.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // BASE_URL es "./", así que hay que resolverla contra la página: `new URL(x, "./")`
    // lanza excepción. Así funciona igual en la raíz que en un subdirectorio.
    const base = new URL(import.meta.env.BASE_URL, document.baseURI);
    navigator.serviceWorker
      .register(new URL("sw.js", base), { scope: base.pathname })
      .catch(() => {
        /* sin service worker la app sigue funcionando, solo pierde el modo offline */
      });
  });
}
