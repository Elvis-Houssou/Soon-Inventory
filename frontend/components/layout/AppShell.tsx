"use client";

import { FileText, Home, Package, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { usePwa } from "@/lib/pwa";
import { SyncIndicator } from "./SyncIndicator";
import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  ["/", Home, "Accueil"],
  ["/expeditions", FileText, "Historique"],
  ["/produits", Package, "Catalogue produits"],
  ["/parametres", SlidersHorizontal, "Paramètres"],
] as const;

export function AppShell({ title, wizard, children }: { title: string; wizard?: boolean; children: ReactNode }) {
  const path = usePathname();
  usePwa();
  const current = wizard ? "/" : path;
  return (
    <div className={wizard ? "app wiz" : "app"}>
      <nav className="rail" aria-label="Navigation principale">
        <svg className="logo" viewBox="0 0 40 40" role="img" aria-label="Soon Inventory">
          <path fill="currentColor" d="M4 4h32c0 9-7 14-16 14S4 13 4 4zm0 32c0-9 7-14 16-14s16 5 16 14z" />
        </svg>
        {NAV.map(([href, Icon, label]) => (
          <Link key={href} href={href} aria-label={label} title={label} aria-current={current === href ? "page" : undefined}>
            <Icon className="i" aria-hidden />
          </Link>
        ))}
        <span className="sp" />
      </nav>
      <main>
        <header className="top">
          <h1>{title}</h1>
          <SyncIndicator />
          <ThemeToggle />
        </header>
        {children}
      </main>
    </div>
  );
}
