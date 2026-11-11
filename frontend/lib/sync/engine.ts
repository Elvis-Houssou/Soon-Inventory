import { db } from "../db/db";
import { getMeta, saveShipment, setMeta } from "../db/repo";
import type { DocData } from "../documents/model";
import type { DocumentRecord, OutboxEntry, Shipment, SyncFields } from "../domain/types";

// Synchronisation avec le serveur : on pousse la file d'attente, puis on récupère ce qui a changé ailleurs.
// Règle : une modification locale n'est jamais écrasée en silence.

type SyncedType = "shipment" | "product" | "destination";
type Row = SyncFields & { id: string };
type ServerData = Record<string, unknown> & { id: string; version: number };

export interface PushOperation {
  idempotencyKey: string;
  entityType: OutboxEntry["entityType"];
  entityId: string;
  op: OutboxEntry["op"];
  baseVersion: number;
  data: unknown;
}
export interface PushResult {
  idempotencyKey: string;
  entityType: OutboxEntry["entityType"];
  entityId: string;
  status: "accepted" | "conflict" | "rejected";
  version?: number;
  serverData?: ServerData | null;
  errors?: string[];
}
export interface SyncApi {
  push(body: { deviceId: string; deviceName: string; operations: PushOperation[] }): Promise<{ results: PushResult[] }>;
  pull(cursor: number): Promise<{ changes: { entityType: OutboxEntry["entityType"]; data: ServerData }[]; cursor: number }>;
}
export interface SyncStats {
  pushed: number;
  pulled: number;
  conflicts: number;
  rejected: number;
}

const TABLE = { shipment: "shipments", product: "products", destination: "destinations" } as const;
const table = (t: SyncedType) => db.table<Row, string>(TABLE[t]);
const conflictKey = (id: string) => `conflict:${id}`;
const BATCH = 200;

/** Le serveur envoie null pour « absent » ; les types locaux utilisent undefined. */
function fromServer(type: SyncedType, data: ServerData): Row {
  const clean = JSON.parse(JSON.stringify(data, (_, v) => (v === null ? undefined : v))) as Row;
  const row: Row = { ...clean, syncState: "synced" };
  if (type === "shipment") {
    const s = row as unknown as Shipment;
    s.containerNumbers = s.containers.map((c) => c.containerNumber.trim()).filter(Boolean);
  }
  return row;
}

/** Prévient les écrans ouverts qu'une fiche a été remplacée par une version venue d'ailleurs. */
function notifyRemoteChange(id: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("si-remote-change", { detail: id }));
}

async function buildOperations(): Promise<PushOperation[]> {
  // Une entrée déjà refusée par le serveur n'est pas renvoyée telle quelle : elle le sera quand la donnée aura changé.
  const entries = (await db.outbox.orderBy("createdAt").toArray()).filter((e) => !e.lastError);
  const ops: PushOperation[] = [];
  for (const e of entries) {
    if (e.entityType === "document") {
      const d = await db.documents.get(e.entityId);
      if (!d) await db.outbox.delete(e.id);
      else {
        const data = { shipmentId: d.shipmentId, containerId: d.containerId, format: d.format, version: d.version, data: d.data, generatedAt: d.generatedAt };
        ops.push({ idempotencyKey: e.id, entityType: "document", entityId: d.id, op: "upsert", baseVersion: 0, data });
      }
      continue;
    }
    const row = await table(e.entityType).get(e.entityId);
    if (!row) await db.outbox.delete(e.id);
    // Une fiche en conflit attend le choix de l'utilisateur.
    else if (row.syncState !== "conflict")
      ops.push({ idempotencyKey: e.id, entityType: e.entityType, entityId: row.id, op: e.op, baseVersion: row.version, data: e.op === "delete" ? null : row });
  }
  return ops;
}

async function applyResult(r: PushResult, stats: SyncStats): Promise<void> {
  await db.transaction("rw", [db.shipments, db.products, db.destinations, db.outbox, db.meta], async () => {
    // Si l'entrée a disparu, l'utilisateur a remodifié la donnée pendant l'envoi : une nouvelle entrée l'attend.
    const entry = await db.outbox.get(r.idempotencyKey);
    const fail = async () => {
      stats.rejected++;
      if (entry) await db.outbox.update(entry.id, { attempts: entry.attempts + 1, lastError: (r.errors ?? []).join(" ") || "Refusé par le serveur." });
    };

    if (r.entityType === "document") {
      if (r.status === "accepted") {
        stats.pushed++;
        await db.outbox.delete(r.idempotencyKey);
      } else await fail();
      return;
    }

    const t = table(r.entityType);
    const row = await t.get(r.entityId);
    if (r.status === "accepted") {
      stats.pushed++;
      if (entry) await db.outbox.delete(entry.id);
      if (row) await t.update(r.entityId, { version: r.version ?? row.version, ...(entry ? { syncState: "synced" as const } : {}) });
    } else if (r.status === "conflict") {
      stats.conflicts++;
      if (!r.serverData) {
        // Le serveur ne connaît pas cette donnée : on la renverra comme une création.
        if (row) await t.update(r.entityId, { version: 0 });
      } else if (r.entityType === "shipment") {
        if (row) await t.update(r.entityId, { syncState: "conflict" });
        await db.meta.put({ key: conflictKey(r.entityId), value: r.serverData });
      } else {
        // shortcut: pour un produit ou une destination, la version du serveur l'emporte ; à remplacer par un choix si ces fiches se modifient souvent à deux endroits.
        await t.put(fromServer(r.entityType, r.serverData));
        await db.outbox.where("[entityType+entityId]").equals([r.entityType, r.entityId]).delete();
      }
    } else {
      if (row) await t.update(r.entityId, { syncState: "error" });
      await fail();
    }
  });
}

async function pullChanges(api: SyncApi, stats: SyncStats): Promise<void> {
  const cursor = (await getMeta<number>("cursor")) ?? 0;
  const res = await api.pull(cursor);
  for (const ch of res.changes) {
    if (ch.entityType === "document") {
      if (!(await db.documents.get(ch.data.id))) await db.documents.put(ch.data as unknown as DocumentRecord<DocData>);
      continue;
    }
    // Modification locale en attente : on ne touche à rien, l'envoi suivant révélera le conflit.
    if (await db.outbox.where("[entityType+entityId]").equals([ch.entityType, ch.data.id]).count()) continue;
    const local = await table(ch.entityType).get(ch.data.id);
    if (local && local.version >= ch.data.version) continue;
    await table(ch.entityType).put(fromServer(ch.entityType, ch.data));
    stats.pulled++;
    if (ch.entityType === "shipment") notifyRemoteChange(ch.data.id);
  }
  await setMeta("cursor", res.cursor);
}

export async function getDeviceId(): Promise<string> {
  let id = await getMeta<string>("deviceId");
  if (!id) await setMeta("deviceId", (id = crypto.randomUUID()));
  return id;
}

export async function syncOnce(api: SyncApi, deviceName = ""): Promise<SyncStats> {
  const stats: SyncStats = { pushed: 0, pulled: 0, conflicts: 0, rejected: 0 };
  const deviceId = await getDeviceId();
  const ops = await buildOperations();
  for (let i = 0; i < ops.length; i += BATCH) {
    const { results } = await api.push({ deviceId, deviceName, operations: ops.slice(i, i + BATCH) });
    for (const r of results) await applyResult(r, stats);
  }
  await pullChanges(api, stats);
  return stats;
}

export const getConflict = (shipmentId: string) => getMeta<ServerData>(conflictKey(shipmentId));

/** Conflit : garder la version de cet appareil. Elle sera renvoyée par-dessus celle du serveur. */
export async function keepMine(shipmentId: string): Promise<void> {
  const server = await getConflict(shipmentId);
  const row = await db.shipments.get(shipmentId);
  if (!server || !row) return;
  await db.shipments.update(shipmentId, { version: server.version });
  await db.meta.delete(conflictKey(shipmentId));
  await saveShipment(row);
}

/** Conflit : prendre la version du serveur. Les modifications de cet appareil sont abandonnées. */
export async function takeServer(shipmentId: string): Promise<void> {
  const server = await getConflict(shipmentId);
  if (!server) return;
  await db.transaction("rw", db.shipments, db.outbox, db.meta, async () => {
    await db.shipments.put(fromServer("shipment", server) as unknown as Shipment);
    await db.outbox.where("[entityType+entityId]").equals(["shipment", shipmentId]).delete();
    await db.meta.delete(conflictKey(shipmentId));
  });
  notifyRemoteChange(shipmentId);
}
