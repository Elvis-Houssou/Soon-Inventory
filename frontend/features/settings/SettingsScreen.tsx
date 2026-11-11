"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Check, Plus, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { THEME_CHOICES, useThemeMode } from "@/components/layout/ThemeToggle";
import { db } from "@/lib/db/db";
import { deleteDestination, listDestinations, saveDestination } from "@/lib/db/repo";
import { setThemeMode } from "@/lib/theme";

export async function addDestination(name: string): Promise<string | undefined> {
  const n = name.trim();
  if (!n) return;
  const existing = (await listDestinations()).find((d) => d.name.toLowerCase() === n.toLowerCase());
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  await saveDestination({ id, name: n, version: 0, syncState: "local", updatedAt: "" });
  return id;
}

export function SettingsScreen() {
  const mode = useThemeMode();
  const destinations = useLiveQuery(() => listDestinations(), []);
  const pending = useLiveQuery(() => db.outbox.count(), []);
  const [name, setName] = useState("");

  return (
    <div className="setg">
      <section className="panel">
        <h2>Apparence</h2>
        <div className="chips">
          {THEME_CHOICES.map(([v, Icon, label]) => (
            <button key={v} type="button" className="chip" aria-pressed={mode === v} onClick={() => setThemeMode(v)}>
              <Icon className="i" aria-hidden /> {label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Destinations</h2>
        {destinations?.length === 0 && <p className="muted" style={{ marginBottom: 16 }}>Aucune destination. Ajoutez celles où vous expédiez souvent.</p>}
        <div className="chips">
          {destinations?.map((d) => (
            <span className="chip rm" key={d.id}>
              {d.name}
              <button type="button" aria-label={`Enlever ${d.name}`} onClick={() => deleteDestination(d.id)}>
                <X className="i" aria-hidden />
              </button>
            </span>
          ))}
        </div>
        <form
          className="addrow"
          onSubmit={async (e) => {
            e.preventDefault();
            await addDestination(name);
            setName("");
          }}
        >
          <label className="field">
            Nouvelle destination
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Exemple : UK" />
          </label>
          <button className="btn ghost" disabled={!name.trim()}>
            <Plus className="i" aria-hidden /> Ajouter
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>Données de cet appareil</h2>
        <div className="saved" style={{ margin: "0 0 14px" }}>
          <span className="ok">
            <Check className="i" aria-hidden />
          </span>
          <p>
            Tout est enregistré sur cet appareil.
            <br />
            <span className="muted">
              {pending ? `${pending} modification${pending > 1 ? "s" : ""} en attente d'envoi. ` : ""}La sauvegarde sur le serveur n&apos;est pas encore activée.
            </span>
          </p>
        </div>
        <p className="warn" style={{ margin: 0 }}>
          <TriangleAlert className="i" aria-hidden />
          <span>Tant que la sauvegarde sur le serveur n&apos;est pas activée, vos fiches n&apos;existent que sur cet appareil. S&apos;il est perdu, elles le sont aussi.</span>
        </p>
      </section>
    </div>
  );
}
