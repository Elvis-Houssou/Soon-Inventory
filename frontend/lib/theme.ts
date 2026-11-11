export type ThemeMode = "light" | "dark" | "system";

const KEY = "si-theme";
const EVENT = "si-theme-change";

// Sérialisée dans THEME_SCRIPT : ne doit dépendre d'aucune variable du module.
function apply() {
  let m: ThemeMode = "light";
  try {
    m = (localStorage.getItem("si-theme") as ThemeMode) || "light";
  } catch {}
  const dark = m === "dark" || (m === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.dataset.mode = m;
}

/** Exécuté dans <head> avant le premier rendu, pour éviter le flash du mauvais thème. */
export const THEME_SCRIPT = `(${apply.toString()})()`;

export const getThemeMode = (): ThemeMode => (document.documentElement.dataset.mode as ThemeMode) || "light";

export function setThemeMode(m: ThemeMode) {
  try {
    localStorage.setItem(KEY, m);
  } catch {}
  apply();
  dispatchEvent(new Event(EVENT));
}

export function subscribeTheme(onChange: () => void) {
  const mq = matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", apply);
  addEventListener(EVENT, onChange);
  return () => {
    mq.removeEventListener("change", apply);
    removeEventListener(EVENT, onChange);
  };
}
