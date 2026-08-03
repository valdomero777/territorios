import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";

/**
 * Credenciales del proyecto de Firebase compartido. Vienen de variables de
 * entorno (`.env.local` en desarrollo, secrets del repo en el despliegue de
 * GitHub Actions) — no son secretas en sí (la protección real la dan las
 * reglas de Firestore + que solo existe una cuenta en Auth), pero así se
 * puede cambiar de proyecto sin tocar código.
 */
export const CONFIGURADO = Boolean(import.meta.env.VITE_FIREBASE_API_KEY);

export const CORREO_COMPARTIDO = import.meta.env.VITE_FIREBASE_SHARED_EMAIL ?? "";

const app = CONFIGURADO
  ? initializeApp({
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    })
  : null;

export const auth = app ? getAuth(app) : null;
// Los campos opcionales del dominio (capitanId, notas, telefono…) llegan como
// `undefined` cuando no se capturan, no como ausentes del objeto — Firestore
// rechaza `undefined` a menos que se le pida ignorarlo explícitamente.
export const db = app ? initializeFirestore(app, { ignoreUndefinedProperties: true }) : null;
