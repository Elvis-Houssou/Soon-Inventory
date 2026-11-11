"use client";

import { useEffect, useSyncExternalStore } from "react";
import { type Account, api, ApiError } from "../api";
import { db } from "../db/db";
import { getMeta, setMeta } from "../db/repo";
import { syncOnce } from "./engine";

// Décide quand synchroniser : à l'ouverture, au retour du réseau, après une modification, toutes les minutes, et sur demande.

export interface SyncState {
  /** null = pas de compte connecté : tout reste sur l'appareil. */
  account: Account | null;
  status: "idle" | "syncing" | "error";
  lastSyncAt?: string;
}

let state: SyncState = { account: null, status: "idle" };
const SERVER: SyncState = state;
const listeners = new Set<() => void>();
function set(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((f) => f());
}

let running = false;
export async function syncNow(): Promise<void> {
  if (!state.account || running || !navigator.onLine) return;
  running = true;
  set({ status: "syncing" });
  try {
    await syncOnce(api, navigator.userAgent.slice(0, 80));
    set({ status: "idle", lastSyncAt: new Date().toISOString() });
  } catch (e) {
    // Session expirée : on repasse en mode « sur cet appareil », sans rien effacer.
    if (e instanceof ApiError && e.status === 401) await forget();
    else set({ status: "error" });
  } finally {
    running = false;
  }
}

async function forget() {
  await db.meta.delete("account");
  set({ account: null, status: "idle" });
}

/** Un appareil ne mélange pas les fiches de deux comptes. */
async function adopt(account: Account): Promise<void> {
  const owner = await getMeta<string>("ownerUserId");
  if (owner && owner !== account.id) {
    await api.logout().catch(() => {});
    throw new ApiError(409, "Cet appareil contient déjà les fiches d'un autre compte. Connectez-vous avec ce compte.");
  }
  await setMeta("ownerUserId", account.id);
  await setMeta("account", account);
  set({ account });
  void syncNow();
}

export const login = async (email: string, password: string) => adopt(await api.login(email, password));
export const register = async (email: string, password: string, companyName: string) => adopt(await api.register(email, password, companyName));

/** Les fiches restent sur l'appareil, y compris celles qui n'ont pas encore été envoyées (brief §6.5). */
export async function logout(): Promise<void> {
  await api.logout().catch(() => {});
  await forget();
}

let started = false;
async function start() {
  if (started) return;
  started = true;
  // D'abord le compte mémorisé (disponible hors ligne), puis la vérification auprès du serveur.
  const cached = await getMeta<Account>("account");
  if (cached) set({ account: cached });
  if (navigator.onLine) {
    try {
      await adopt(await api.me());
    } catch (e) {
      if (e instanceof ApiError && e.status === 401 && cached) await forget();
    }
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  addEventListener("si-local-change", () => {
    clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), 4000);
  });
  addEventListener("online", () => void syncNow());
  setInterval(() => document.visibilityState === "visible" && void syncNow(), 60_000);
}

export function useSync(): SyncState {
  useEffect(() => void start(), []);
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => state,
    () => SERVER,
  );
}
