import type { DocData } from "../documents/model";
import type { Destination, DocumentRecord, OutboxEntry, Product, Shipment, SyncFields } from "../domain/types";
import { db } from "./db";

type Entity = SyncFields & { id: string };
type TableName = "shipments" | "products" | "destinations";

// Chaque écriture est atomique avec l'outbox, qui garde une seule entrée par entité (clé renouvelée).
async function write(name: TableName, entityType: OutboxEntry["entityType"], entity: Entity, op: OutboxEntry["op"]): Promise<void> {
  const now = new Date().toISOString();
  const table = db.table<Entity, string>(name);
  await db.transaction("rw", table, db.outbox, async () => {
    await table.put({ ...entity, updatedAt: now, syncState: "pending" });
    await db.outbox.where("[entityType+entityId]").equals([entityType, entity.id]).delete();
    await db.outbox.add({ id: crypto.randomUUID(), entityType, entityId: entity.id, op, createdAt: now, attempts: 0 });
  });
}

async function softDelete(name: TableName, entityType: OutboxEntry["entityType"], id: string) {
  const e = await db.table<Entity, string>(name).get(id);
  if (e) await write(name, entityType, { ...e, deletedAt: new Date().toISOString() }, "delete");
}

const alive = <T extends SyncFields>(xs: T[]) => xs.filter((x) => !x.deletedAt);

export const saveShipment = (s: Shipment) => {
  const next: Shipment = { ...s, containerNumbers: s.containers.map((c) => c.containerNumber.trim()).filter(Boolean) };
  return write("shipments", "shipment", next, "upsert");
};
export const getShipment = (id: string) => db.shipments.get(id);
export const listShipments = async () => alive(await db.shipments.orderBy("updatedAt").reverse().toArray());
export const deleteShipment = (id: string) => softDelete("shipments", "shipment", id);

export const saveProduct = (p: Product) => write("products", "product", p, "upsert");
export const listProducts = async (opts?: { activeOnly?: boolean }) =>
  alive(await db.products.orderBy("designation").toArray()).filter((p) => !opts?.activeOnly || p.isActive);

export const saveDestination = (d: Destination) => write("destinations", "destination", d, "upsert");
export const deleteDestination = (id: string) => softDelete("destinations", "destination", id);
export const listDestinations = async () => alive(await db.destinations.orderBy("name").toArray());

export const getMeta = async <T>(key: string) => (await db.meta.get(key))?.value as T | undefined;
export const setMeta = async (key: string, value: unknown) => {
  await db.meta.put({ key, value });
};

export const listDocuments = async (shipmentId: string) =>
  (await db.documents.where("shipmentId").equals(shipmentId).sortBy("generatedAt")).reverse();

/** Mêmes données que la dernière version : on la réutilise. Sinon nouvelle version ; les anciennes ne sont jamais effacées. */
export async function saveDocumentVersion(
  shipmentId: string, containerId: string | null, format: DocumentRecord["format"], data: DocData,
): Promise<DocumentRecord<DocData>> {
  return db.transaction("rw", db.documents, db.outbox, async () => {
    const same = (await db.documents.where("shipmentId").equals(shipmentId).toArray())
      .filter((d) => d.containerId === containerId && d.format === format)
      .sort((a, b) => b.version - a.version);
    if (same[0] && JSON.stringify(same[0].data) === JSON.stringify(data)) return same[0];
    const now = new Date().toISOString();
    const record: DocumentRecord<DocData> = {
      id: crypto.randomUUID(), shipmentId, containerId, format, version: (same[0]?.version ?? 0) + 1, data, generatedAt: now,
    };
    await db.documents.add(record);
    await db.outbox.add({ id: crypto.randomUUID(), entityType: "document", entityId: record.id, op: "upsert", createdAt: now, attempts: 0 });
    return record;
  });
}
