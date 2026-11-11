"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { listProducts, saveProduct } from "@/lib/db/repo";
import { designation } from "@/lib/domain/product";
import type { Product } from "@/lib/domain/types";
import { cartonWeightG, formatKg, parseWeightToGrams } from "@/lib/domain/weights";

const EMPTY = { name: "", weight: "", unit: "kg" as "kg" | "g", per: "" };

export function ProductsScreen() {
  const products = useLiveQuery(() => listProducts(), []);
  const [form, setForm] = useState(EMPTY);
  const [query, setQuery] = useState("");

  const grams = parseWeightToGrams(form.weight, form.unit);
  const per = /^\d+$/.test(form.per.trim()) ? Number(form.per) : 0;
  const name = form.name.trim().toUpperCase();
  const draft = name && grams && per > 0 ? { des: designation(name, grams, per, "pkts"), unitG: grams * per } : null;
  const duplicate = !!draft && !!products?.some((p) => p.designation === draft.des);
  const shown = products?.filter((p) => p.designation.toLowerCase().includes(query.toLowerCase()));

  async function add() {
    if (!draft || duplicate || !grams) return;
    const p: Product = {
      id: crypto.randomUUID(), name, designation: draft.des, packageWeightG: grams, packagesPerCarton: per,
      weightType: "net", unitLabel: "pkts", isActive: true, version: 0, syncState: "local", updatedAt: "",
    };
    await saveProduct(p);
    setForm(EMPTY);
  }

  return (
    <div className="goods">
      <section className="panel np">
        <h2>Nouveau produit</h2>
        <label className="field">
          Nom du produit
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Exemple : PONDU" autoCapitalize="characters" />
        </label>
        <div className="addrow">
          <label className="field">
            Poids d&apos;un paquet
            <input value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} inputMode="decimal" placeholder="1" />
          </label>
          <div className="chips" style={{ margin: 0 }}>
            {(["kg", "g"] as const).map((u) => (
              <button key={u} type="button" className="chip" aria-pressed={form.unit === u} onClick={() => setForm({ ...form, unit: u })}>
                {u}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          Paquets par carton
          <input value={form.per} onChange={(e) => setForm({ ...form, per: e.target.value })} inputMode="numeric" placeholder="15" />
        </label>
        <p className="prev" role="status">
          {draft ? draft.des : "Aperçu du produit"}
          <small>
            {!draft
              ? "Remplissez les trois champs pour voir le poids du carton."
              : duplicate
                ? "Ce produit existe déjà dans le catalogue."
                : `${formatKg(draft.unitG)} kg par carton, calculé automatiquement`}
          </small>
        </p>
        <button type="button" className="btn pri" disabled={!draft || duplicate} onClick={add}>
          <Plus className="i" aria-hidden /> Ajouter au catalogue
        </button>
      </section>

      <section className="panel">
        <label className="search">
          <Search className="i" aria-hidden />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Chercher un produit" aria-label="Chercher un produit" />
        </label>
        <div style={{ marginTop: 8 }}>
          {products?.length === 0 && <p className="empty">Votre catalogue est vide. Ajoutez votre premier produit avec le formulaire.</p>}
          {!!products?.length && shown?.length === 0 && <p className="empty">Aucun produit trouvé pour « {query} ».</p>}
          {shown?.map((p) => (
            <div className="prow" key={p.id}>
              <span className="d">{p.designation}</span>
              <span>
                <span className="num">{formatKg(cartonWeightG(p))}</span> kg par carton
              </span>
              <label className="check">
                <input type="checkbox" checked={p.isActive} onChange={(e) => saveProduct({ ...p, isActive: e.target.checked })} />
                Actif
              </label>
            </div>
          ))}
        </div>
        <p className="note">Un produit inactif n&apos;est plus proposé dans les nouvelles expéditions. Les anciennes fiches ne changent pas.</p>
      </section>
    </div>
  );
}
