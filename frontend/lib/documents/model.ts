import { effectiveDates } from "../domain/shipment";
import type { Grams, Shipment } from "../domain/types";
import { containerTotals, formatInt, formatKg } from "../domain/weights";

// Données figées d'un document : l'aperçu, le PDF et l'Excel lisent tous cette structure,
// et c'est elle qui est conservée à chaque version.

export interface DocSheet {
  destination: string;
  depotDate: string;
  departureDate: string;
  sealNumber: string;
  containerNumber: string;
  rows: { designation: string; cartons: number }[];
  totalCartons: number;
  totalWeightG: Grams;
}

export interface DocData {
  sheets: DocSheet[];
  /** Présent uniquement sur le document global. */
  summary?: { containers: number; cartons: number; weightG: Grams };
}

/** Libellés du document de référence du client (brief §3). */
export const LABELS = {
  destination: "DESTINATION",
  depot: "DATE DE DEPOT",
  departure: "DATE DE DEPART",
  seal: "NUMERO DE PLOMB",
  container: "NUMERO CONTENEUR",
  designation: "DESIGNATION",
  cartons: "NOMBRE DE CARTON",
  totalCartons: "NOMBRE TOTAL DE CARTON",
  totalWeight: "TONNAGE TOTAL DU CONTENEUR",
  summary: "RECAPITULATIF GENERAL",
  summaryContainers: "NOMBRE DE CONTENEURS",
  summaryWeight: "TONNAGE TOTAL",
} as const;

/** « JEUDI, 26/03/2026 » */
export function dateLabel(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  return `${d.toLocaleDateString("fr-FR", { weekday: "long" }).toUpperCase()}, ${d.toLocaleDateString("fr-FR")}`;
}

// Les séparateurs de milliers français sont des espaces insécables fines, absentes des polices PDF standard.
const plain = (s: string) => s.replace(/\s/g, " ");
export const cartonsLabel = (n: number) => `${plain(formatInt(n))} cartons`;
export const weightLabel = (g: Grams) => `${plain(formatKg(g))} kg`;

/** Sans containerId : document global (tous les conteneurs, puis le récapitulatif). */
export function buildDocument(s: Shipment, destinationName: string, containerId?: string): DocData {
  const containers = containerId ? s.containers.filter((c) => c.id === containerId) : s.containers;
  const sheets = containers.map((c): DocSheet => {
    const dates = effectiveDates(s, c);
    const t = containerTotals(c);
    return {
      destination: (destinationName || "—").toUpperCase(),
      depotDate: dateLabel(dates.depotDate),
      departureDate: dateLabel(dates.departureDate),
      sealNumber: (c.sealNumber.trim() || "—").toUpperCase(),
      containerNumber: (c.containerNumber.trim() || "—").toUpperCase(),
      rows: c.items.filter((it) => it.quantityCartons > 0).map((it) => ({ designation: it.designation.toUpperCase(), cartons: it.quantityCartons })),
      totalCartons: t.cartons,
      totalWeightG: t.weightG,
    };
  });
  if (containerId) return { sheets };
  return {
    sheets,
    summary: {
      containers: sheets.length,
      cartons: sheets.reduce((n, x) => n + x.totalCartons, 0),
      weightG: sheets.reduce((n, x) => n + x.totalWeightG, 0),
    },
  };
}
