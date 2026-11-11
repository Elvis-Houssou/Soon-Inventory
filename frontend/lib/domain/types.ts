// Modèle local, voir docs/schema-donnees.md §3.

/** Poids en grammes entiers. Jamais de flottant dans un calcul. */
export type Grams = number;

export type SyncState = "local" | "pending" | "syncing" | "synced" | "error" | "conflict";

export interface SyncFields {
  /** Dernière version confirmée par le serveur (0 = jamais envoyée). */
  version: number;
  syncState: SyncState;
  updatedAt: string;
  deletedAt?: string;
}

export interface ContainerItem {
  id: string;
  productId: string;
  productName: string;
  designation: string;
  quantityCartons: number;
  unitWeightG: Grams;
  weightType: "net" | "gross";
}

export interface Container {
  id: string;
  containerNumber: string;
  isoTypeCode?: string;
  sealNumber: string;
  /** Absent = dates de l'expédition. */
  customDates?: { depotDate?: string; departureDate?: string };
  items: ContainerItem[];
}

export interface Shipment extends SyncFields {
  id: string;
  reference: string;
  destinationId?: string;
  /** 'YYYY-MM-DD', date sans fuseau. */
  depotDate?: string;
  departureDate?: string;
  status: "draft" | "completed" | "archived";
  notes: string;
  containers: Container[];
  /** Index de recherche, dérivé de containers. */
  containerNumbers: string[];
}

export interface Product extends SyncFields {
  id: string;
  name: string;
  designation: string;
  packageWeightG: Grams;
  packagesPerCarton: number;
  grossWeightPerCartonG?: Grams;
  weightType: "net" | "gross";
  unitLabel: string;
  isActive: boolean;
}

export interface Destination extends SyncFields {
  id: string;
  name: string;
  countryCode?: string;
}

export interface OutboxEntry {
  /** Clé d'idempotence, renouvelée à chaque modification. */
  id: string;
  entityType: "shipment" | "product" | "destination" | "document";
  entityId: string;
  op: "upsert" | "delete";
  createdAt: string;
  attempts: number;
  lastError?: string;
}
