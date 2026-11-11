"use client";

import { Copy, Plus, Trash2 } from "lucide-react";
import { addContainer, duplicateContainer, removeContainer, updateContainer } from "@/lib/domain/shipment";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { containerTotals, formatInt, formatKg } from "@/lib/domain/weights";
import { DateWarning } from "./StepGeneral";
import type { StepProps } from "./Wizard";

export function StepContainers({ shipment: s, update }: StepProps) {
  return (
    <>
      <h2>Les conteneurs</h2>
      <p className="muted">Un conteneur suffit pour commencer. Vous pourrez en ajouter à tout moment.</p>
      <div className="conts">
        {s.containers.map((c, i) => {
          const t = containerTotals(c);
          const set = (patch: Parameters<typeof updateContainer>[2]) => update(updateContainer(s, c.id, patch));
          return (
            <article className="cont" key={c.id}>
              <div className="cont-h">
                <h3>Conteneur {i + 1}</h3>
                <button type="button" className="icon-btn" aria-label={`Dupliquer le conteneur ${i + 1}`} title="Dupliquer" onClick={() => update(duplicateContainer(s, c.id))}>
                  <Copy className="i" aria-hidden />
                </button>
                <button
                  type="button"
                  className="icon-btn del"
                  aria-label={`Supprimer le conteneur ${i + 1}`}
                  title="Supprimer"
                  disabled={s.containers.length < 2}
                  onClick={() => {
                    // shortcut: confirmation native, à remplacer par un dialogue avec annulation au Plan 5.
                    if (c.items.length && !confirm(`Supprimer le conteneur ${i + 1} et ses ${c.items.length} produits ?`)) return;
                    update(removeContainer(s, c.id));
                  }}
                >
                  <Trash2 className="i" aria-hidden />
                </button>
              </div>
              <label className="field">
                Numéro de conteneur
                <input value={c.containerNumber} onChange={(e) => set({ containerNumber: e.target.value })} placeholder="HLBU 995319 0" autoCapitalize="characters" />
              </label>
              <label className="field">
                Numéro de plomb
                <input value={c.sealNumber} onChange={(e) => set({ sealNumber: e.target.value })} placeholder="HLC 3784425" autoCapitalize="characters" />
              </label>
              <label className="check">
                <input type="checkbox" checked={!!c.customDates} onChange={(e) => set({ customDates: e.target.checked ? {} : undefined })} />
                Dates différentes pour ce conteneur
              </label>
              {c.customDates && (
                <>
                  <div className="g2">
                    <label className="field">
                      Dépôt
                      <input type="date" value={c.customDates.depotDate ?? ""} onChange={(e) => set({ customDates: { ...c.customDates, depotDate: e.target.value || undefined } })} />
                    </label>
                    <label className="field">
                      Départ
                      <input type="date" value={c.customDates.departureDate ?? ""} onChange={(e) => set({ customDates: { ...c.customDates, departureDate: e.target.value || undefined } })} />
                    </label>
                  </div>
                  <DateWarning depot={c.customDates.depotDate} departure={c.customDates.departureDate} />
                </>
              )}
              <div className="cont-f">
                <span>
                  <AnimatedNumber value={t.cartons} format={formatInt} />cartons
                </span>
                <span>
                  <AnimatedNumber value={t.weightG} format={formatKg} step={1000} />kg
                </span>
              </div>
            </article>
          );
        })}
        <button type="button" className="addc" onClick={() => update(addContainer(s))}>
          <Plus className="i" aria-hidden />
          Ajouter un conteneur
        </button>
      </div>
    </>
  );
}
