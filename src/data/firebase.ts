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
// GitHub Actions guarda los *secrets* tal cual se pegaron en la consola, y es
// fácil que quede un salto de línea colgado al final (pegar desde un archivo,
// por ejemplo) — con eso "grupo@territorios.app" y "grupo@territorios.app\n"
// son cuentas distintas para Firebase Auth y el login nunca cuadra. Se
// recorta cada valor por si acaso.
const recortar = (v?: string) => v?.trim() ?? "";

export const CONFIGURADO = Boolean(recortar(import.meta.env.VITE_FIREBASE_API_KEY));

export const CORREO_COMPARTIDO = recortar(import.meta.env.VITE_FIREBASE_SHARED_EMAIL);

const app = CONFIGURADO
  ? initializeApp({
      apiKey: recortar(import.meta.env.VITE_FIREBASE_API_KEY),
      authDomain: recortar(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
      projectId: recortar(import.meta.env.VITE_FIREBASE_PROJECT_ID),
      appId: recortar(import.meta.env.VITE_FIREBASE_APP_ID),
    })
  : null;

export const auth = app ? getAuth(app) : null;
// Los campos opcionales del dominio (capitanId, notas, telefono…) llegan como
// `undefined` cuando no se capturan, no como ausentes del objeto — Firestore
// rechaza `undefined` a menos que se le pida ignorarlo explícitamente.
export const db = app ? initializeFirestore(app, { ignoreUndefinedProperties: true }) : null;
