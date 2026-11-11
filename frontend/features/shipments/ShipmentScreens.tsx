"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ArrowRight, Check, Copy, Package, Pencil, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { listDestinations, listShipments, saveShipment } from "@/lib/db/repo";
import { duplicateShipment } from "@/lib/domain/shipment";
import type { Shipment } from "@/lib/domain/types";
import { formatInt, formatKg, shipmentTotals } from "@/lib/domain/weights";

const STATUS: Record<Shipment["status"], [string, string]> = {
  draft: ["Brouillon", "tag draft"],
  completed: ["Terminée", "tag done"],
  archived: ["Archivée", "tag"],
};
const frDate = (v?: string) => (v ? new Date(`${v}T00:00`).toLocaleDateString("fr-FR") : "—");

function useShipments() {
  const shipments = useLiveQuery(() => listShipments(), []);
  const destinations = useLiveQuery(() => listDestinations(), []);
  const destName = (s: Shipment) => destinations?.find((d) => d.id === s.destinationId)?.name ?? "—";
  const router = useRouter();
  /** Reprise : copie enregistrée puis ouverte ; l'ancienne expédition n'est pas touchée. */
  async function resume(src: Shipment) {
    const copy = duplicateShipment(src);
    await saveShipment(copy);
    router.push(`/expedition?id=${copy.id}`);
  }
  return { shipments, destinations, destName, resume };
}

function Rows({ items, destName, resume }: { items: Shipment[]; destName: (s: Shipment) => string; resume: (s: Shipment) => void }) {
  return (
    <div className="rows">
      <div className="row h">
        <span>Référence</span>
        <span>Destination</span>
        <span>Dépôt</span>
        <span>Conteneurs</span>
        <span>Cartons</span>
        <span>Tonnage</span>
        <span>Statut</span>
        <span />
      </div>
      {items.map((s) => {
        const t = shipmentTotals(s);
        const label = s.reference || `Expédition du ${new Date(s.updatedAt).toLocaleDateString("fr-FR")}`;
        return (
          <div className="row" key={s.id}>
            <span className="ref">{label}</span>
            <span>{destName(s)}</span>
            <span className="num">{frDate(s.depotDate)}</span>
            <span className="num">{s.containers.length}</span>
            <span className="num">{formatInt(t.cartons)}</span>
            <span className="num">{formatKg(t.weightG)} kg</span>
            <span className={STATUS[s.status][1]}>{STATUS[s.status][0]}</span>
            <span style={{ display: "flex", gap: 6 }}>
              <Link className="icon-btn" href={`/expedition?id=${s.id}`} aria-label={`Ouvrir ${label}`} title="Ouvrir">
                <Pencil className="i" aria-hidden />
              </Link>
              <button type="button" className="icon-btn" aria-label={`Reprendre ${label}`} title="Reprendre" onClick={() => resume(s)}>
                <Copy className="i" aria-hidden />
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

const matches = (s: Shipment, dest: string, q: string) =>
  [s.reference, dest, ...s.containerNumbers].join(" ").toLowerCase().includes(q.trim().toLowerCase());

export function HomeScreen() {
  const { shipments, destName, resume } = useShipments();
  const [query, setQuery] = useState("");
  const last = shipments?.[0];
  const lastTotals = last && shipmentTotals(last);
  const shown = shipments?.filter((s) => matches(s, destName(s), query)).slice(0, 8);

  return (
    <>
      <section className="blocks">
        <div className="block b-or">
          <h2>Nouvelle expédition</h2>
          <p>Choisissez la destination, ajoutez les conteneurs et les cartons. Les totaux se calculent tout seuls.</p>
          <Link className="btn dark" href="/expedition">
            Commencer <ArrowRight className="i" aria-hidden />
          </Link>
        </div>
        {last && lastTotals && (
          <div className="block b-ye">
            <h2>Reprendre la dernière</h2>
            <p>
              {destName(last)} · {last.containers.length} conteneur{last.containers.length > 1 ? "s" : ""} · {formatInt(lastTotals.cartons)} cartons. Les produits et
              les quantités sont recopiés, l&apos;ancienne fiche ne change pas.
            </p>
            <button type="button" className="btn dark" onClick={() => resume(last)}>
              Reprendre <Copy className="i" aria-hidden />
            </button>
          </div>
        )}
        <div className="block b-bk">
          <h2>Vos fiches sont sur cet appareil</h2>
          <div className="saved">
            <span className="ok">
              <Check className="i" aria-hidden />
            </span>
            <p>Chaque modification est enregistrée aussitôt, sans bouton à presser.</p>
          </div>
          <div className="links">
            <Link className="btn ghost" href="/produits">
              <Package className="i" aria-hidden /> Catalogue
            </Link>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="list-head">
          <h2>Dernières expéditions</h2>
          {!!shipments?.length && (
            <label className="search">
              <Search className="i" aria-hidden />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Chercher une référence ou une destination" aria-label="Chercher une expédition" />
            </label>
          )}
        </div>
        {shipments?.length === 0 && <p className="empty">Aucune expédition pour l&apos;instant. Commencez par créer la première.</p>}
        {!!shipments?.length && shown?.length === 0 && <p className="empty">Aucune expédition ne correspond. Effacez la recherche pour tout revoir.</p>}
        {!!shown?.length && <Rows items={shown} destName={destName} resume={resume} />}
      </section>
    </>
  );
}

export function HistoryScreen() {
  const { shipments, destinations, destName, resume } = useShipments();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Shipment["status"] | "">("");
  const [dest, setDest] = useState("");
  const shown = shipments?.filter((s) => matches(s, destName(s), query) && (!status || s.status === status) && (!dest || s.destinationId === dest));
  const chip = (label: string, on: boolean, click: () => void) => (
    <button key={label} type="button" className="chip sm" aria-pressed={on} onClick={click}>
      {label}
    </button>
  );

  return (
    <section className="panel">
      <label className="search" style={{ marginBottom: 14 }}>
        <Search className="i" aria-hidden />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Chercher une référence, une destination ou un numéro de conteneur" aria-label="Chercher une expédition" />
      </label>
      <div className="chips">
        {chip("Toutes", status === "", () => setStatus(""))}
        {chip("Brouillons", status === "draft", () => setStatus("draft"))}
        {chip("Terminées", status === "completed", () => setStatus("completed"))}
        {chip("Archivées", status === "archived", () => setStatus("archived"))}
        {!!destinations?.length && <span className="sep" />}
        {!!destinations?.length && chip("Toutes les destinations", dest === "", () => setDest(""))}
        {destinations?.map((d) => chip(d.name, dest === d.id, () => setDest(d.id)))}
      </div>
      {shipments?.length === 0 && <p className="empty">Aucune expédition pour l&apos;instant. Créez la première depuis l&apos;accueil.</p>}
      {!!shipments?.length && shown?.length === 0 && <p className="empty">Aucune expédition ne correspond à ces filtres.</p>}
      {!!shown?.length && <Rows items={shown} destName={destName} resume={resume} />}
    </section>
  );
}
