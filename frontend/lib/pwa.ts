"use client";

import { useEffect, useSyncExternalStore } from "react";

type InstallPrompt = Event & { prompt: () => Promise<void> };

let installPrompt: InstallPrompt | null = null;
let started = false;
const INSTALL_EVENT = "si-install-change";

/** Lancé une fois au chargement : service worker, mise en cache des pages, stockage persistant. */
function start() {
  if (started) return;
  started = true;

  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPrompt = e as InstallPrompt;
    dispatchEvent(new Event(INSTALL_EVENT));
  });
  addEventListener("appinstalled", () => {
    installPrompt = null;
    dispatchEvent(new Event(INSTALL_EVENT));
  });

  // Demande au navigateur de ne pas effacer les fiches quand l'appareil manque de place (brief §6.5).
  void navigator.storage?.persist?.();

  // En développement, un service worker servirait des fichiers périmés.
  if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker
    .register("/sw.js")
    .then(() => navigator.serviceWorker.ready)
    .then((reg) => reg.active?.postMessage("warm"))
    .catch(() => {});
}

export function usePwa() {
  useEffect(start, []);
}

const subscribeOnline = (f: () => void) => {
  addEventListener("online", f);
  addEventListener("offline", f);
  return () => {
    removeEventListener("online", f);
    removeEventListener("offline", f);
  };
};
export const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

const subscribeInstall = (f: () => void) => {
  addEventListener(INSTALL_EVENT, f);
  return () => removeEventListener(INSTALL_EVENT, f);
};
/** Renvoie la fonction d'installation quand le navigateur la propose, sinon null. */
export function useInstall(): (() => void) | null {
  const available = useSyncExternalStore(subscribeInstall, () => !!installPrompt, () => false);
  return available ? () => void installPrompt?.prompt() : null;
}
