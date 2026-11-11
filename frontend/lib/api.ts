import type { SyncApi } from "./sync/engine";

const BASE = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1`;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface Account {
  id: string;
  email: string;
  companyName: string;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  // credentials: le cookie de session (illisible par ce code) accompagne chaque appel.
  const res = await fetch(BASE + path, { credentials: "include", headers: { "Content-Type": "application/json" }, ...init });
  if (!res.ok) {
    const detail = await res.json().then((b) => b.detail, () => null);
    throw new ApiError(res.status, typeof detail === "string" ? detail : "Vérifiez les informations saisies.");
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

const post = <T>(path: string, body?: unknown) => call<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  me: () => call<Account>("/auth/me"),
  login: (email: string, password: string) => post<Account>("/auth/login", { email, password }),
  register: (email: string, password: string, companyName: string) => post<Account>("/auth/register", { email, password, company_name: companyName }),
  logout: () => post<void>("/auth/logout"),
  push: (body) => post("/sync/push", body),
  pull: (cursor) => call(`/sync/pull?cursor=${cursor}`),
} satisfies SyncApi & Record<string, unknown>;
