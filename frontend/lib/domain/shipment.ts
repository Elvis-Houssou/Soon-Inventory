import type { Container, ContainerItem, Product, Shipment } from "./types";
import { cartonWeightG } from "./weights";

// Toutes les fonctions sont pures : elles renvoient un nouvel objet et ne modifient jamais leur argument.

const uid = () => crypto.randomUUID();

const newContainer = (): Container => ({ id: uid(), containerNumber: "", sealNumber: "", items: [] });

function withContainers(s: Shipment, containers: Container[]): Shipment {
  return { ...s, containers, containerNumbers: containers.map((c) => c.containerNumber.trim()).filter(Boolean) };
}

const mapContainer = (s: Shipment, id: string, f: (c: Container) => Container): Shipment =>
  withContainers(s, s.containers.map((c) => (c.id === id ? f(c) : c)));

export function newShipment(): Shipment {
  return {
    id: uid(), reference: "", status: "draft", notes: "", containers: [newContainer()], containerNumbers: [],
    version: 0, syncState: "local", updatedAt: new Date().toISOString(),
  };
}

export const addContainer = (s: Shipment): Shipment => withContainers(s, [...s.containers, newContainer()]);

/** Sans effet s'il ne reste qu'un conteneur. */
export const removeContainer = (s: Shipment, containerId: string): Shipment =>
  s.containers.length < 2 ? s : withContainers(s, s.containers.filter((c) => c.id !== containerId));

/** La copie suit l'original ; ses numéros sont vidés pour forcer la vérification. */
export function duplicateContainer(s: Shipment, containerId: string): Shipment {
  const i = s.containers.findIndex((c) => c.id === containerId);
  if (i < 0) return s;
  const src = s.containers[i];
  const copy: Container = {
    ...structuredClone(src), id: uid(), containerNumber: "", sealNumber: "",
    items: src.items.map((it) => ({ ...it, id: uid() })),
  };
  return withContainers(s, [...s.containers.slice(0, i + 1), copy, ...s.containers.slice(i + 1)]);
}

export const updateContainer = (s: Shipment, containerId: string, patch: Partial<Omit<Container, "id" | "items">>): Shipment =>
  mapContainer(s, containerId, (c) => ({ ...c, ...patch }));

/** Un produit n'a qu'une ligne par conteneur : s'il y est déjà, on renvoie l'index de sa ligne. */
export function addItem(s: Shipment, containerId: string, p: Product): { shipment: Shipment; index: number } {
  const c = s.containers.find((x) => x.id === containerId);
  if (!c) return { shipment: s, index: -1 };
  const existing = c.items.findIndex((it) => it.productId === p.id);
  if (existing >= 0) return { shipment: s, index: existing };
  // Snapshot : la ligne ne suit plus les modifications ultérieures du catalogue.
  const item: ContainerItem = {
    id: uid(), productId: p.id, productName: p.name, designation: p.designation,
    quantityCartons: 0, unitWeightG: cartonWeightG(p), weightType: p.weightType,
  };
  return { shipment: mapContainer(s, containerId, (x) => ({ ...x, items: [...x.items, item] })), index: c.items.length };
}

export const setQuantity = (s: Shipment, containerId: string, itemId: string, quantity: number): Shipment =>
  mapContainer(s, containerId, (c) => ({
    ...c, items: c.items.map((it) => (it.id === itemId ? { ...it, quantityCartons: Math.max(0, Math.trunc(quantity) || 0) } : it)),
  }));

export const removeItem = (s: Shipment, containerId: string, itemId: string): Shipment =>
  mapContainer(s, containerId, (c) => ({ ...c, items: c.items.filter((it) => it.id !== itemId) }));

export function effectiveDates(s: Shipment, c: Container): { depotDate?: string; departureDate?: string } {
  return c.customDates ?? { depotDate: s.depotDate, departureDate: s.departureDate };
}

/** Reprise : nouvelle expédition à partir d'une ancienne, qui n'est jamais modifiée. */
export function duplicateShipment(src: Shipment): Shipment {
  const containers = src.containers.map((c) => ({
    id: uid(), containerNumber: "", sealNumber: "", isoTypeCode: c.isoTypeCode,
    items: c.items.map((it) => ({ ...it, id: uid() })),
  }));
  return {
    id: uid(), reference: "", destinationId: src.destinationId, status: "draft", notes: "",
    containers, containerNumbers: [], version: 0, syncState: "local", updatedAt: new Date().toISOString(),
  };
}

export type Issue = {
  code: "destination" | "dates" | "dates_order" | "container_number" | "seal_number" | "empty_container" | "zero_quantity";
  containerIndex?: number;
};

export function validateShipment(s: Shipment): Issue[] {
  const out: Issue[] = [];
  if (!s.destinationId) out.push({ code: "destination" });
  if (!s.depotDate || !s.departureDate) out.push({ code: "dates" });
  else if (s.departureDate < s.depotDate) out.push({ code: "dates_order" });
  s.containers.forEach((c, containerIndex) => {
    if (!c.containerNumber.trim()) out.push({ code: "container_number", containerIndex });
    if (!c.sealNumber.trim()) out.push({ code: "seal_number", containerIndex });
    if (!c.items.length) out.push({ code: "empty_container", containerIndex });
    else if (c.items.some((it) => !it.quantityCartons)) out.push({ code: "zero_quantity", containerIndex });
    const d = c.customDates;
    if (d?.depotDate && d.departureDate && d.departureDate < d.depotDate) out.push({ code: "dates_order", containerIndex });
  });
  return out;
}
