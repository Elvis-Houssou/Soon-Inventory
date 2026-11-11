import type { Container, ContainerItem, Grams, Product, Shipment } from "./types";

const fr = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 });
const MAX_QUANTITY = 999_999;

export function cartonWeightG(
  p: Pick<Product, "packageWeightG" | "packagesPerCarton" | "grossWeightPerCartonG" | "weightType">,
): Grams {
  if (p.weightType === "gross" && p.grossWeightPerCartonG) return p.grossWeightPerCartonG;
  return p.packageWeightG * p.packagesPerCarton;
}

export const lineWeightG = (it: ContainerItem): Grams => it.quantityCartons * it.unitWeightG;

export function containerTotals(c: Container): { cartons: number; weightG: Grams } {
  return c.items.reduce(
    (t, it) => ({ cartons: t.cartons + it.quantityCartons, weightG: t.weightG + lineWeightG(it) }),
    { cartons: 0, weightG: 0 },
  );
}

export function shipmentTotals(s: Shipment): { cartons: number; weightG: Grams } {
  return s.containers.reduce(
    (t, c) => {
      const x = containerTotals(c);
      return { cartons: t.cartons + x.cartons, weightG: t.weightG + x.weightG };
    },
    { cartons: 0, weightG: 0 },
  );
}

export const formatInt = (n: number): string => fr.format(n);

/** Seul endroit où l'on divise : affichage uniquement. */
export const formatKg = (g: Grams): string => fr.format(g / 1000);

export function parseWeightToGrams(input: string, unit: "kg" | "g"): Grams | null {
  const n = Number(input.trim().replace(",", "."));
  if (!input.trim() || !Number.isFinite(n) || n <= 0) return null;
  const g = Math.round(unit === "kg" ? n * 1000 : n);
  return g > 0 ? g : null;
}

/** Chiffres de tête seulement : « 12,5 » vaut 12, « -3 » vaut 0. */
export function parseQuantity(input: string): number {
  const m = /^\d+/.exec(input.trim());
  return m ? Math.min(Number(m[0]), MAX_QUANTITY) : 0;
}
