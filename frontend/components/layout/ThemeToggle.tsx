"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { getThemeMode, setThemeMode, subscribeTheme, type ThemeMode } from "@/lib/theme";

export const THEME_CHOICES: [ThemeMode, typeof Sun, string][] = [
  ["light", Sun, "Clair"],
  ["dark", Moon, "Sombre"],
  ["system", Monitor, "Comme l'appareil"],
];

export const useThemeMode = () => useSyncExternalStore(subscribeTheme, getThemeMode, () => "light" as ThemeMode);

export function ThemeToggle() {
  const mode = useThemeMode();
  return (
    <div className="seg" role="group" aria-label="Apparence">
      {THEME_CHOICES.map(([v, Icon, label]) => (
        <button key={v} type="button" aria-pressed={mode === v} aria-label={label} title={label} onClick={() => setThemeMode(v)}>
          <Icon className="i" aria-hidden />
        </button>
      ))}
    </div>
  );
}
