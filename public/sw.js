/**
 * Service worker mínimo, sin dependencias.
 *
 *  - instalación: precarga el shell y todos los archivos que declara (ver `precargar`);
 *  - navegación: red primero, caché si no hay señal (y el shell como último recurso);
 *  - resto de GET del mismo origen: caché primero y revalidación en segundo plano;
 *  - teselas del mapa: caché primero, con tope de tamaño.
 */

const CACHE = "territorios-v4";
const CACHE_TESELAS = "territorios-teselas-v1";
const MAX_TESELAS = 900; // ~40 MB: suficiente para todo el territorio en varios acercamientos
const SHELL = new URL("./index.html", self.registration.scope).pathname;

const ES_TESELA = (url) =>
  /(^|\.)tile\.openstreetmap\.org$/.test(url.hostname) ||
  /(^|\.)arcgisonline\.com$/.test(url.hostname);

/**
 * `ignoreVary` es imprescindible: los archivos se precargan con peticiones
 * `no-cors` (que no mandan cabecera `Origin`) mientras que el navegador pide los
 * módulos en modo `cors` (que sí la manda). Como el servidor responde con
 * `Vary: Origin`, sin esta opción la caché nunca coincide y la app queda en
 * blanco justo cuando no hay señal.
 */
const buscar = (req) => caches.match(req, { ignoreVary: true });

/** Guarda la tesela y poda la caché cuando crece de más (FIFO). */
async function guardarTesela(req, res) {
  const c = await caches.open(CACHE_TESELAS);
  await c.put(req, res);
  const claves = await c.keys();
  if (claves.length > MAX_TESELAS) {
    await Promise.all(claves.slice(0, claves.length - MAX_TESELAS).map((k) => c.delete(k)));
  }
}

/**
 * Guarda el shell y TODOS los archivos que declara, ya durante la instalación.
 *
 * Hace falta hacerlo aquí porque en la primera visita el service worker todavía
 * no controla la página: si esperáramos a interceptar peticiones, la app solo
 * funcionaría sin conexión a partir de la tercera visita — justo el caso que
 * rompe a quien instala en casa y sale a la calle.
 *
 * Los nombres llevan hash y no se conocen de antemano, así que se leen del HTML.
 */
async function precargar() {
  const c = await caches.open(CACHE);
  const base = new URL("./", self.registration.scope);
  const res = await fetch(new URL("./index.html", base), { cache: "no-cache" });
  // Clonar ANTES de leer el cuerpo: después de `res.text()` el cuerpo ya está
  // consumido y `res.clone()` lanza excepción, lo que abortaba la instalación.
  await c.put(SHELL, res.clone());
  const html = await res.text();

  const rutas = new Set(["./manifest.webmanifest", "./favicon.svg", "./icono.svg"]);
  for (const m of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
    const ruta = m[1];
    if (!ruta.startsWith("http") && !ruta.startsWith("//")) rutas.add(ruta);
  }
  await Promise.all(
    [...rutas].map((r) =>
      c.add(new Request(new URL(r, base), { cache: "reload" })).catch(() => {
        /* un archivo opcional que falte no debe abortar la instalación */
      }),
    ),
  );
}

self.addEventListener("install", (e) => {
  e.waitUntil(precargar().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(
          claves.filter((k) => k !== CACHE && k !== CACHE_TESELAS).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Teselas del mapa: caché primero. Así el fondo que el capitán ya vio sigue
  // estando cuando se queda sin señal en la calle.
  if (ES_TESELA(url)) {
    e.respondWith(
      buscar(req).then(
        (guardada) =>
          guardada ||
          fetch(req)
            .then((res) => {
              if (res.ok || res.type === "opaque") void guardarTesela(req, res.clone());
              return res;
            })
            .catch(() => Response.error()),
      ),
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(SHELL, copia));
          return res;
        })
        .catch(() => buscar(req).then((r) => r || buscar(SHELL))),
    );
    return;
  }

  e.respondWith(
    buscar(req).then((cacheada) => {
      const red = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copia));
          }
          return res;
        })
        .catch(() => cacheada);
      return cacheada || red;
    }),
  );
});
