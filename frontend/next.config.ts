import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Le navigateur appelle /api/… sur le domaine de l'application ; Next relaie vers le serveur Python.
  // Le cookie de session reste ainsi sur un seul domaine (les cookies entre deux sites sont bloqués par les navigateurs).
  async rewrites() {
    // On ne garde que « https://hôte » : une barre finale ou un chemin collé par erreur (/docs…) cassait tous les appels.
    const api = new URL(process.env.API_ORIGIN || "http://localhost:8000").origin;
    return [{ source: "/api/:path*", destination: `${api}/api/:path*` }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
