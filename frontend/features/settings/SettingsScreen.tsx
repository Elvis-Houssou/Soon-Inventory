"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Download, Plus, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { THEME_CHOICES, useThemeMode } from "@/components/layout/ThemeToggle";
import { deleteDestination, listDestinations, saveDestination } from "@/lib/db/repo";
import { useInstall } from "@/lib/pwa";
import { AccountPanel } from "./AccountPanel";
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
  const [name, setName] = useState("");
  const install = useInstall();

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

      <AccountPanel />

      <section className="panel">
        <h2>Données de cet appareil</h2>
        <p className="warn" style={{ margin: 0 }}>
          <TriangleAlert className="i" aria-hidden />
          <span>Sans compte, vos fiches n&apos;existent que sur cet appareil. S&apos;il est perdu avant un envoi au serveur, les dernières fiches le sont aussi.</span>
        </p>
        {install && (
          <button type="button" className="btn dark" style={{ marginTop: 16 }} onClick={install}>
            <Download className="i" aria-hidden /> Installer l&apos;application
          </button>
        )}
      </section>
    </div>
  );
}
