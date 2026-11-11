"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Plus, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { addDestination } from "@/features/settings/SettingsScreen";
import { listDestinations } from "@/lib/db/repo";
import type { StepProps } from "./Wizard";

export function DateWarning({ depot, departure }: { depot?: string; departure?: string }) {
  if (!depot || !departure || departure >= depot) return null;
  return (
    <p className="warn" role="alert">
      <TriangleAlert className="i" aria-hidden />
      <span>La date de départ est avant la date de dépôt. Vérifiez les deux dates.</span>
    </p>
  );
}

export function StepGeneral({ shipment: s, update }: StepProps) {
  const destinations = useLiveQuery(() => listDestinations(), []);
  const [other, setOther] = useState("");

  return (
    <div className="panel">
      <h2>Où part cette expédition ?</h2>
      <p className="muted" style={{ marginBottom: 18 }}>
        {destinations?.length ? "Touchez une destination ou écrivez-en une nouvelle." : "Écrivez votre première destination. Elle sera proposée en un clic la prochaine fois."}
      </p>
      <div className="chips">
        {destinations?.map((d) => (
          <button key={d.id} type="button" className="chip" aria-pressed={s.destinationId === d.id} onClick={() => update({ ...s, destinationId: d.id })}>
            {d.name}
          </button>
        ))}
      </div>
      <form
        className="addrow"
        style={{ maxWidth: 520, marginBottom: 26 }}
        onSubmit={async (e) => {
          e.preventDefault();
          const id = await addDestination(other);
          if (id) update({ ...s, destinationId: id });
          setOther("");
        }}
      >
        <label className="field">
          Autre destination
          <input value={other} onChange={(e) => setOther(e.target.value)} placeholder="Exemple : UK" />
        </label>
        <button className="btn ghost" disabled={!other.trim()}>
          <Plus className="i" aria-hidden /> Ajouter
        </button>
      </form>

      <div className="g2" style={{ maxWidth: 640 }}>
        <label className="field">
          Date de dépôt
          <input type="date" value={s.depotDate ?? ""} onChange={(e) => update({ ...s, depotDate: e.target.value || undefined })} />
        </label>
        <label className="field">
          Date de départ
          <input type="date" value={s.departureDate ?? ""} onChange={(e) => update({ ...s, departureDate: e.target.value || undefined })} />
        </label>
      </div>
      <DateWarning depot={s.depotDate} departure={s.departureDate} />

      <label className="field" style={{ maxWidth: 640, marginTop: 22 }}>
        Référence (facultatif)
        <input value={s.reference} onChange={(e) => update({ ...s, reference: e.target.value })} placeholder="Votre numéro ou un mot pour la retrouver" />
      </label>
    </div>
  );
}
