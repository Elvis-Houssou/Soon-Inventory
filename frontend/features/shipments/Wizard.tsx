"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, ArrowRight, Check, TriangleAlert } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
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
function useShipmentDraft(id: string | null, isNew: boolean) {
  const [shipment, setShipment] = useState<Shipment | null | undefined>(undefined);
  const load = useCallback(() => {
    if (!id) return;
    void getShipment(id).then((s) => {
      if (s && !s.deletedAt) setShipment(s);
      // Nouvelle expédition pas encore enregistrée : elle n'existe qu'à l'écran jusqu'à la première saisie.
      else setShipment(isNew && !s ? { ...newShipment(), id } : null);
    });
  }, [id, isNew]);
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
  const { shipment, update } = useShipmentDraft(id, params.has("nouveau"));
  const [current, setCurrent] = useState(0);

  // Sans identifiant : on en choisit un, sans rien enregistrer. Ouvrir puis quitter ne laisse aucun brouillon vide.
  useEffect(() => {
    if (!id) router.replace(`/expedition?id=${crypto.randomUUID()}&nouveau=1`);
  }, [id, router]);
  const [direction, setDirection] = useState(1);

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

  const go = (n: number) => {
    setDirection(n >= step ? 1 : -1);
    // L'adresse perd son marqueur « nouveau » : la fiche doit exister avant, même si rien n'a été saisi.
    if (params.has("nouveau")) update(shipment);
    router.replace(`/expedition?id=${shipment.id}&etape=${n}`);
  };
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

      {/* Motion anime l'arrivée de l'étape ; les chiffres sont animés par GSAP, jamais le même élément. */}
      <motion.section key={step} className="stage" initial={{ opacity: 0, x: 28 * direction }} animate={{ opacity: 1, x: 0 }} transition={{ type: "spring", stiffness: 380, damping: 34 }}>
        {step === 1 && <StepGeneral {...props} />}
        {step === 2 && <StepContainers {...props} />}
        {step === 3 && <StepGoods {...props} current={active} setCurrent={setCurrent} />}
        {step === 4 && <StepReview {...props} current={active} setCurrent={setCurrent} />}
        {step === 5 && <StepDocument {...props} />}
      </motion.section>

      <div className="bar">
        <div className="tot" role="status">
          <span>
            <AnimatedNumber value={totals.cartons} format={formatInt} />cartons
          </span>
          <span>
            <AnimatedNumber value={totals.weightG} format={formatKg} step={1000} />kg
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
