// Service worker de Soon Inventory : rend l'application ouvrable sans réseau.
// Les données métier ne passent pas par ici : elles vivent dans IndexedDB (Dexie).

const VERSION = "v1";
const PAGES = `si-pages-${VERSION}`;
const ASSETS = `si-assets-${VERSION}`;
const ROUTES = ["/", "/expeditions", "/expedition", "/produits", "/parametres"];

/** Met en cache les cinq pages et tous les fichiers du build (liste écrite par scripts/precache-manifest.mjs). */
async function warm() {
  const pages = await caches.open(PAGES);
  const assets = await caches.open(ASSETS);
  const files = await fetch("/_next/static/precache.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : []));
  await Promise.all([
    ...ROUTES.map(async (route) => {
      const res = await fetch(route, { cache: "no-store" });
      if (res.ok) await pages.put(route, res);
    }),
    ...files.map(async (path) => {
      if (await assets.match(path)) return;
      const res = await fetch(path);
      if (res.ok) await assets.put(path, res);
    }),
  ]);
  // Fichiers d'anciens builds : on ne les retire qu'avec une liste en main, jamais hors ligne.
  if (files.length) {
    const wanted = new Set(files);
    for (const req of await assets.keys()) {
      const path = new URL(req.url).pathname;
      if (path.startsWith("/_next/static/") && !wanted.has(path)) await assets.delete(req);
    }
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(warm().catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("si-") && k !== PAGES && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "warm") event.waitUntil(warm().catch(() => {}));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;

  // Fichiers à nom unique par version : le cache d'abord.
  if (url.pathname.startsWith("/_next/static/") || /\.(png|svg|ico|webmanifest)$/.test(url.pathname)) {
    event.respondWith(
      caches.open(ASSETS).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Ouverture d'une page : le réseau d'abord pour rester à jour, la copie locale sans réseau.
  // L'identifiant d'une expédition est dans la requête (?id=…) : la même page sert pour toutes.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(url.pathname, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(url.pathname, { cacheName: PAGES })) || (await caches.match("/", { cacheName: PAGES })) || Response.error()),
    );
    return;
  }

  // Navigations internes de Next (charges RSC) : réseau, sinon dernière copie connue de cette page.
  if (req.headers.get("RSC")) {
    const key = `${url.pathname}?__rsc`;
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(key, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(key, { cacheName: PAGES })) || Response.error()),
    );
  }
});
