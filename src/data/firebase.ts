import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
} from "firebase/firestore";
import type { Firestore } from "firebase/firestore";

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
//
// La caché persistente (IndexedDB) es lo que mantiene el consumo dentro de la
// cuota gratuita: sin ella, CADA vez que alguien abre la app —y en el celular
// eso pasa muchas veces al día— Firestore vuelve a bajar del servidor los
// cientos de documentos de la bitácora, y cada documento bajado es una
// "lectura" facturable. Con caché, al reabrir la app los datos salen del
// propio teléfono y el servidor solo manda lo que cambió desde la última vez.
// `persistentMultipleTabManager` permite además tener la app abierta en varias
// pestañas del mismo equipo sin que una desactive la caché de la otra.
const conCache = (a: NonNullable<typeof app>): Firestore => {
  try {
    return initializeFirestore(a, {
      ignoreUndefinedProperties: true,
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (e) {
    // Navegador sin IndexedDB (modo privado de algunos, WebView recortado…):
    // la app sigue funcionando, solo que sin el ahorro de lecturas.
    console.warn("No se pudo activar la caché en disco de Firestore; se sigue sin ella.", e);
    return initializeFirestore(a, { ignoreUndefinedProperties: true });
  }
};

export const db = app ? conCache(app) : null;
