import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"], weight: ["500", "600", "700"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "Soon Inventory",
  description: "Créez vos fiches d'inventaire d'expédition en quelques étapes.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Le script de thème modifie <html> avant l'hydratation : suppressHydrationWarning garde sa valeur.
    <html lang="fr" className={`${manrope.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        <script
          type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
