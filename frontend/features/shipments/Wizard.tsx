"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, ArrowRight, Check, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { getShipment, saveShipment } from "@/lib/db/repo";
import { newShipment } from "@/lib/domain/shipment";
import type { Shipment } from "@/lib/domain/types";
import { formatInt, formatKg, shipmentTotals } from "@/lib/domain/weights";
import { keepMine, takeServer } from "@/lib/sync/engine";
import { StepContainers } from "./StepContainers";
import { StepDocument } from "./StepDocument";
import { StepGeneral } from "./StepGeneral";
import { StepGoods } from "./StepGoods";
import { StepReview } from "./StepReview";

const STEPS = ["Destination et dates", "Conteneurs", "Marchandises", "Vérification", "Document"];

export type StepProps = { shipment: Shipment; update: (next: Shipment) => void };

/** Le brouillon vit en mémoire pour la saisie, et chaque modification est écrite aussitôt dans Dexie. */
function useShipmentDraft(id: string | null) {
  const [shipment, setShipment] = useState<Shipment | null | undefined>(undefined);
  const load = useCallback(() => {
    if (id) void getShipment(id).then((s) => setShipment(s && !s.deletedAt ? s : null));
  }, [id]);
  useEffect(() => {
    load();
    // La synchronisation a remplacé cette fiche par une version venue d'ailleurs : on recharge.
    const onRemote = (e: Event) => (e as CustomEvent<string>).detail === id && load();
    addEventListener("si-remote-change", onRemote);
    return () => removeEventListener("si-remote-change", onRemote);
  }, [id, load]);
  const update = useCallback((next: Shipment) => {
    setShipment(next);
    void saveShipment(next);
  }, []);
  return { shipment, update };
}

/** Deux appareils ont modifié la même fiche : l'utilisateur choisit, rien n'est écrasé sans lui. */
function ConflictBanner({ id }: { id: string }) {
  const inConflict = useLiveQuery(async () => (await getShipment(id))?.syncState === "conflict", [id]);
  if (!inConflict) return null;
  return (
    <div className="warn conflict" role="alert">
      <TriangleAlert className="i" aria-hidden />
      <div>
        <p>Cette expédition a aussi été modifiée sur un autre appareil. Laquelle voulez-vous garder ?</p>
        <div className="addrow" style={{ marginTop: 12 }}>
          <button type="button" className="btn dark" onClick={() => void keepMine(id)}>
            Garder celle de cet appareil
          </button>
          <button type="button" className="btn ghost" onClick={() => void takeServer(id)}>
            Prendre celle de l&apos;autre appareil
          </button>
        </div>
      </div>
    </div>
  );
}

export function Wizard() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("id");
  const step = Math.min(STEPS.length, Math.max(1, Number(params.get("etape")) || 1));
  const { shipment, update } = useShipmentDraft(id);
  const [current, setCurrent] = useState(0);

  // Sans identifiant : on crée l'expédition une seule fois (le mode strict de React rejoue les effets).
  const created = useRef(false);
  useEffect(() => {
    if (id || created.current) return;
    created.current = true;
    const s = newShipment();
    saveShipment(s).then(() => router.replace(`/expedition?id=${s.id}`));
  }, [id, router]);

  if (shipment === null)
    return (
      <AppShell title="Expédition introuvable" wizard>
        <section className="panel">
          <p className="empty">Cette expédition n&apos;existe pas sur cet appareil.</p>
          <Link className="btn pri" href="/">
            Revenir à l&apos;accueil
          </Link>
        </section>
      </AppShell>
    );
  if (!shipment) return <AppShell title="Nouvelle expédition" wizard>{null}</AppShell>;

  const go = (n: number) => router.replace(`/expedition?id=${shipment.id}&etape=${n}`);
  const totals = shipmentTotals(shipment);
  const props: StepProps = { shipment, update };
  const active = Math.min(current, shipment.containers.length - 1);

  return (
    <AppShell title={shipment.status === "draft" ? "Nouvelle expédition" : "Expédition"} wizard>
      <ol className="steps">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button type="button" className={i + 1 < step ? "done" : ""} aria-current={i + 1 === step ? "step" : undefined} onClick={() => go(i + 1)}>
              <b>{i + 1 < step ? <Check className="i" aria-hidden /> : i + 1}</b>
              <span>{label}</span>
            </button>
          </li>
        ))}
      </ol>

      <ConflictBanner id={shipment.id} />

      <section className="stage">
        {step === 1 && <StepGeneral {...props} />}
        {step === 2 && <StepContainers {...props} />}
        {step === 3 && <StepGoods {...props} current={active} setCurrent={setCurrent} />}
        {step === 4 && <StepReview {...props} />}
        {step === 5 && <StepDocument {...props} />}
      </section>

      <div className="bar">
        <div className="tot" role="status">
          <span>
            <span className="num">{formatInt(totals.cartons)}</span>cartons
          </span>
          <span>
            <span className="num">{formatKg(totals.weightG)}</span>kg
          </span>
        </div>
        {step > 1 ? (
          <button type="button" className="btn ghost" onClick={() => go(step - 1)}>
            <ArrowLeft className="i" aria-hidden /> Retour
          </button>
        ) : (
          <Link className="btn ghost" href="/">
            <ArrowLeft className="i" aria-hidden /> Accueil
          </Link>
        )}
        {step < STEPS.length ? (
          <button type="button" className="btn pri" onClick={() => go(step + 1)}>
            Continuer <ArrowRight className="i" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            className="btn pri"
            onClick={() => {
              update({ ...shipment, status: "completed" });
              router.push("/");
            }}
          >
            <Check className="i" aria-hidden /> Terminer
          </button>
        )}
      </div>
    </AppShell>
  );
}
