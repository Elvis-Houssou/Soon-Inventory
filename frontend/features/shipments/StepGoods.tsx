"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Check, Plus, Search, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { listProducts } from "@/lib/db/repo";
import { addItem, removeItem, setQuantity } from "@/lib/domain/shipment";
import type { Product, Shipment } from "@/lib/domain/types";
import { cartonWeightG, formatKg, lineWeightG, parseQuantity } from "@/lib/domain/weights";
import type { StepProps } from "./Wizard";

export function ContainerTabs({ shipment, current, setCurrent }: { shipment: Shipment; current: number; setCurrent: (i: number) => void }) {
  return (
    <div className="tabs" role="tablist">
      {shipment.containers.map((c, i) => (
        <button key={c.id} type="button" role="tab" aria-selected={i === current} onClick={() => setCurrent(i)}>
          Conteneur {i + 1}
          {c.containerNumber && ` · ${c.containerNumber}`}
        </button>
      ))}
    </div>
  );
}

export function StepGoods({ shipment: s, update, current, setCurrent }: StepProps & { current: number; setCurrent: (i: number) => void }) {
  const products = useLiveQuery(() => listProducts({ activeOnly: true }), []);
  const [query, setQuery] = useState("");
  const focusIndex = useRef<number | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const c = s.containers[current];

  // Après l'ajout d'un produit, le curseur va directement sur sa quantité.
  useEffect(() => {
    if (focusIndex.current === null) return;
    const input = list.current?.querySelectorAll<HTMLInputElement>("input")[focusIndex.current];
    focusIndex.current = null;
    input?.focus();
    input?.select();
  });

  function pick(p: Product) {
    const { shipment, index } = addItem(s, c.id, p);
    focusIndex.current = index;
    // Produit déjà présent : rien ne change, on force quand même un rendu pour placer le curseur.
    update(shipment === s ? { ...s } : shipment);
  }

  const shown = products?.filter((p) => p.designation.toLowerCase().includes(query.toLowerCase()));

  return (
    <>
      <h2>Les marchandises</h2>
      <p className="muted">Touchez un produit pour l&apos;ajouter, puis écrivez le nombre de cartons.</p>
      <ContainerTabs shipment={s} current={current} setCurrent={setCurrent} />
      <div className="goods">
        <div className="panel">
          <label className="search">
            <Search className="i" aria-hidden />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Chercher un produit" aria-label="Chercher un produit" />
          </label>
          <div className="cat">
            {products?.length === 0 && (
              <div className="empty">
                <p style={{ marginBottom: 14 }}>Aucun produit dans votre catalogue.</p>
                <Link className="btn pri" href="/produits">
                  <Plus className="i" aria-hidden /> Créer un produit
                </Link>
              </div>
            )}
            {!!products?.length && shown?.length === 0 && <p className="empty">Aucun produit trouvé pour « {query} ».</p>}
            {shown?.map((p) => {
              const inside = c.items.some((it) => it.productId === p.id);
              return (
                <button key={p.id} type="button" className={inside ? "prod in" : "prod"} onClick={() => pick(p)}>
                  <span>
                    {p.designation}
                    <small>
                      {formatKg(cartonWeightG(p))} kg par carton{inside && " · déjà dans ce conteneur"}
                    </small>
                  </span>
                  <i className="plus">{inside ? <Check className="i" aria-hidden /> : <Plus className="i" aria-hidden />}</i>
                </button>
              );
            })}
          </div>
        </div>

        <div className="panel" ref={list}>
          <h3 style={{ marginBottom: 8 }}>Dans le conteneur {current + 1}</h3>
          {c.items.length === 0 && <p className="empty">Ce conteneur est vide. Choisissez un premier produit dans la liste.</p>}
          <AnimatePresence initial={false}>
          {c.items.map((it) => {
            const setQty = (q: number) => update(setQuantity(s, c.id, it.id, q));
            return (
              <motion.div className="line" key={it.id} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0 }} transition={{ duration: 0.22 }} style={{ overflow: "hidden" }}>
                <span className="d">{it.designation}</span>
                <span className="qty">
                  <button type="button" aria-label="Retirer un carton" onClick={() => setQty(it.quantityCartons - 1)}>
                    −
                  </button>
                  <input
                    inputMode="numeric"
                    value={it.quantityCartons || ""}
                    placeholder="0"
                    aria-label={`Cartons de ${it.designation}`}
                    onChange={(e) => setQty(parseQuantity(e.target.value))}
                  />
                  <button type="button" aria-label="Ajouter un carton" onClick={() => setQty(parseQuantity(String(it.quantityCartons + 1)))}>
                    +
                  </button>
                </span>
                <span className="w">
                  <AnimatedNumber value={lineWeightG(it)} format={formatKg} step={1000} /> kg
                </span>
                <button type="button" className="icon-btn del" aria-label={`Enlever ${it.designation}`} onClick={() => update(removeItem(s, c.id, it.id))}>
                  <Trash2 className="i" aria-hidden />
                </button>
              </motion.div>
            );
          })}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}
