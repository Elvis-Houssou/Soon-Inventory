import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Soon Inventory",
    short_name: "Soon Inventory",
    description: "Créez vos fiches d'inventaire d'expédition en quelques étapes.",
    lang: "fr",
    start_url: "/",
    display: "standalone",
    background_color: "#E8E7E3",
    theme_color: "#F47B20",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
