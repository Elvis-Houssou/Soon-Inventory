import Dexie, { type EntityTable } from "dexie";
import type { Destination, OutboxEntry, Product, Shipment } from "../domain/types";

// Schéma : docs/schema-donnees.md §3. Les booléens ne sont pas indexables dans IndexedDB : isActive se filtre en mémoire.
class SoonInventory extends Dexie {
  shipments!: EntityTable<Shipment, "id">;
  products!: EntityTable<Product, "id">;
  destinations!: EntityTable<Destination, "id">;
  outbox!: EntityTable<OutboxEntry, "id">;
  meta!: EntityTable<{ key: string; value: unknown }, "key">;

  constructor() {
    super("soon-inventory");
    this.version(1).stores({
      shipments: "id, status, updatedAt, destinationId, *containerNumbers",
      products: "id, designation",
      destinations: "id, name",
      documents: "id, shipmentId, generatedAt",
      outbox: "id, [entityType+entityId], createdAt",
      meta: "key",
    });
  }
}

export const db = new SoonInventory();
