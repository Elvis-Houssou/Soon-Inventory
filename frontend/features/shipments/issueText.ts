import type { Issue } from "@/lib/domain/shipment";

const TEXT: Record<Issue["code"], string> = {
  destination: "La destination n'est pas choisie.",
  dates: "Il manque une date de dépôt ou de départ.",
  dates_order: "La date de départ est avant la date de dépôt.",
  container_number: "il manque le numéro de conteneur.",
  seal_number: "il manque le numéro de plomb.",
  empty_container: "aucune marchandise.",
  zero_quantity: "un produit n'a pas de quantité.",
};

export function issueText(i: Issue): string {
  if (i.containerIndex === undefined) return TEXT[i.code];
  const t = i.code === "dates_order" ? "la date de départ est avant la date de dépôt." : TEXT[i.code];
  return `Conteneur ${i.containerIndex + 1} : ${t}`;
}
