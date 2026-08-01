import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Rutas relativas: la app funciona igual en la raíz de Netlify/Vercel que en
  // un subdirectorio de GitHub Pages (usuario.github.io/servicio/).
  base: "./",
});
