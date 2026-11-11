"use client";

import { Check, TriangleAlert } from "lucide-react";
import { validateShipment } from "@/lib/domain/shipment";
import { containerTotals, formatInt, formatKg, shipmentTotals } from "@/lib/domain/weights";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { ContainerSplit } from "./ContainerSplit";
import { issueText } from "./issueText";
import { ContainerTabs } from "./StepGoods";
import type { StepProps } from "./Wizard";

export function StepReview({ shipment: s, current, setCurrent }: StepProps & { current: number; setCurrent: (i: number) => void }) {
  const issues = validateShipment(s);
  const total = shipmentTotals(s);
  return (
    <>
      <h2>Vérification</h2>
      <p className="muted">Relisez les totaux avant de créer le document.</p>
      {issues.length ? (
        <div className="alerts">
          {issues.map((i) => (
            <p className="warn" style={{ margin: 0 }} key={`${i.code}-${i.containerIndex}`}>
              <TriangleAlert className="i" aria-hidden />
              <span>{issueText(i)}</span>
            </p>
          ))}
        </div>
      ) : (
        <p className="okmsg">
          <Check className="i" aria-hidden />
          Tout est complet.
        </p>
      )}
      <div className="panel recap">
        <div className="rc h">
          <span>Conteneur</span>
          <span>Plomb</span>
          <span>Cartons</span>
          <span>Tonnage</span>
        </div>
        {s.containers.map((c, i) => {
          const t = containerTotals(c);
          return (
            <div className="rc" key={c.id}>
              <span>
                <b>Conteneur {i + 1}</b>
                {c.containerNumber && ` · ${c.containerNumber}`}
              </span>
              <span>{c.sealNumber || "—"}</span>
              <span className="num">{formatInt(t.cartons)}</span>
              <span>
                <span className="num">{formatKg(t.weightG)}</span> kg
              </span>
            </div>
          );
        })}
        <div className="rc t">
          <b>Total de l&apos;expédition</b>
          <span />
          <AnimatedNumber value={total.cartons} format={formatInt} />
          <span>
            <AnimatedNumber value={total.weightG} format={formatKg} step={1000} /> kg
          </span>
        </div>
      </div>
      <div className="panel" style={{ marginTop: 10 }}>
        <h3 style={{ marginBottom: 12 }}>Répartition du conteneur</h3>
        <ContainerTabs shipment={s} current={current} setCurrent={setCurrent} />
        <ContainerSplit container={s.containers[current]} />
      </div>
    </>
  );
}
