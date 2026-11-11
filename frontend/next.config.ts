import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Le navigateur appelle /api/… sur le domaine de l'application ; Next relaie vers le serveur Python.
  // Le cookie de session reste ainsi sur un seul domaine (les cookies entre deux sites sont bloqués par les navigateurs).
  async rewrites() {
    const api = process.env.API_ORIGIN ?? "http://localhost:8000";
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
