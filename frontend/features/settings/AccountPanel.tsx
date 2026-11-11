"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Check, LogOut, RefreshCw, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { db } from "@/lib/db/db";
import { login, logout, register, syncNow, useSync } from "@/lib/sync/manager";

export function AccountPanel() {
  const { account, status, lastSyncAt } = useSync();
  const pending = useLiveQuery(() => db.outbox.count(), []) ?? 0;
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ email: "", password: "", company: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "login") await login(form.email, form.password);
      else await register(form.email, form.password, form.company);
      setForm({ email: "", password: "", company: "" });
    } catch (err) {
      setError(err instanceof TypeError ? "Le serveur ne répond pas. Vérifiez votre connexion Internet." : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (account)
    return (
      <section className="panel">
        <h2>Compte et sauvegarde</h2>
        <div className="saved" style={{ margin: "0 0 14px" }}>
          <span className="ok">
            <Check className="i" aria-hidden />
          </span>
          <p>
            {account.companyName} · {account.email}
            <br />
            <span className="muted">
              {pending ? `${pending} modification${pending > 1 ? "s" : ""} en attente d'envoi.` : "Tout est sauvegardé sur le serveur."}
              {lastSyncAt && ` Dernier envoi à ${new Date(lastSyncAt).toLocaleTimeString("fr-FR", { timeStyle: "short" })}.`}
            </span>
          </p>
        </div>
        <div className="addrow">
          <button type="button" className="btn dark" disabled={status === "syncing"} onClick={() => void syncNow()}>
            <RefreshCw className="i" aria-hidden /> {status === "syncing" ? "Envoi en cours…" : "Envoyer maintenant"}
          </button>
          <button type="button" className="btn ghost" onClick={() => void logout()}>
            <LogOut className="i" aria-hidden /> Se déconnecter
          </button>
        </div>
        <p className="note">Se déconnecter n&apos;efface rien : vos fiches restent sur cet appareil.</p>
      </section>
    );

  return (
    <section className="panel">
      <h2>Compte et sauvegarde</h2>
      <p className="muted" style={{ marginBottom: 14 }}>
        Avec un compte, vos fiches sont sauvegardées sur le serveur et retrouvées sur vos autres appareils.
      </p>
      <div className="chips">
        <button type="button" className="chip sm" aria-pressed={mode === "login"} onClick={() => setMode("login")}>
          J&apos;ai un compte
        </button>
        <button type="button" className="chip sm" aria-pressed={mode === "register"} onClick={() => setMode("register")}>
          Créer un compte
        </button>
      </div>
      <form className="np" onSubmit={submit}>
        {mode === "register" && (
          <label className="field">
            Nom de votre entreprise
            <input required value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} autoComplete="organization" />
          </label>
        )}
        <label className="field">
          Adresse e-mail
          <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" />
        </label>
        <label className="field">
          Mot de passe{mode === "register" && " (8 caractères au moins)"}
          <input
            required
            type="password"
            minLength={mode === "register" ? 8 : undefined}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            autoComplete={mode === "register" ? "new-password" : "current-password"}
          />
        </label>
        {error && (
          <p className="warn" role="alert" style={{ margin: 0 }}>
            <TriangleAlert className="i" aria-hidden />
            <span>{error}</span>
          </p>
        )}
        <button className="btn pri" disabled={busy}>
          {mode === "login" ? "Se connecter" : "Créer mon compte"}
        </button>
      </form>
    </section>
  );
}
