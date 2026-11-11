import "fake-indexeddb/auto";
import { beforeEach, expect, test } from "vitest";
import { db } from "../db/db";
import { getMeta, getShipment, saveDestination, saveProduct, saveShipment } from "../db/repo";
import { newShipment } from "../domain/shipment";
import type { Product, Shipment } from "../domain/types";
import { getConflict, keepMine, type PushOperation, type PushResult, type SyncApi, syncOnce, takeServer } from "./engine";

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const pondu: Product = {
  id: "p1", name: "PONDU", designation: "PONDU 1 kg × 15 pkts", packageWeightG: 1000, packagesPerCarton: 15,
  weightType: "net", unitLabel: "pkts", isActive: true, version: 0, syncState: "local", updatedAt: "",
};

/** Faux serveur : accepte tout par défaut, garde ce qu'il a reçu. */
function fakeApi(over: Partial<{ answer: (op: PushOperation) => Partial<PushResult>; changes: unknown[]; cursor: number; during: () => Promise<void> }> = {}) {
  const sent: PushOperation[][] = [];
  const api: SyncApi = {
    async push(body) {
      sent.push(body.operations);
      await over.during?.();
      return {
        results: body.operations.map((op) => ({
          idempotencyKey: op.idempotencyKey, entityType: op.entityType, entityId: op.entityId,
          status: "accepted" as const, version: op.baseVersion + 1, ...over.answer?.(op),
        })),
      };
    },
    async pull() {
      return { changes: (over.changes ?? []) as never, cursor: over.cursor ?? 0 };
    },
  };
  return { api, sent };
}

test("envoi accepté : file vidée, version du serveur, état synchronisé", async () => {
  const s = newShipment();
  await saveShipment(s);
  await saveProduct(pondu);
  await saveDestination({ id: "d1", name: "UK", version: 0, syncState: "local", updatedAt: "" });
  const { api, sent } = fakeApi();
  const stats = await syncOnce(api);
  expect(stats).toMatchObject({ pushed: 3, conflicts: 0, rejected: 0 });
  expect(sent[0].map((o) => [o.entityType, o.baseVersion])).toEqual([["shipment", 0], ["product", 0], ["destination", 0]]);
  expect(await db.outbox.count()).toBe(0);
  expect(await getShipment(s.id)).toMatchObject({ version: 1, syncState: "synced" });
  // Rien à renvoyer au passage suivant.
  await syncOnce(api);
  expect(sent).toHaveLength(1);
});

test("une modification locale ne remet pas la version du serveur à zéro", async () => {
  const s = newShipment();
  await saveShipment(s);
  await syncOnce(fakeApi().api);
  // L'écran garde en mémoire l'ancienne version (0) : l'enregistrement doit conserver celle du serveur (1).
  await saveShipment({ ...s, notes: "modifiée" });
  expect(await getShipment(s.id)).toMatchObject({ version: 1, syncState: "pending", notes: "modifiée" });
});

test("modification pendant l'envoi : elle reste en attente et repart au passage suivant", async () => {
  const s = newShipment();
  await saveShipment(s);
  const { api, sent } = fakeApi({ during: () => saveShipment({ ...s, notes: "tapé pendant l'envoi" }) });
  await syncOnce(api);
  expect(await getShipment(s.id)).toMatchObject({ version: 1, syncState: "pending" });
  expect(await db.outbox.count()).toBe(1);
  await syncOnce(fakeApi().api);
  expect(await getShipment(s.id)).toMatchObject({ version: 2, syncState: "synced", notes: "tapé pendant l'envoi" });
  expect(sent).toHaveLength(1);
});

async function conflicted() {
  const s = newShipment();
  await saveShipment({ ...s, notes: "ma version" });
  const server = { ...s, notes: "version du serveur", version: 5, destinationId: null, updatedAt: "2026-11-11T10:00:00Z" };
  await syncOnce(fakeApi({ answer: () => ({ status: "conflict", version: 5, serverData: server as never }) }).api);
  return s;
}

test("conflit : rien n'est écrasé, la fiche attend un choix", async () => {
  const s = await conflicted();
  expect(await getShipment(s.id)).toMatchObject({ syncState: "conflict", notes: "ma version" });
  expect((await getConflict(s.id))?.notes).toBe("version du serveur");
  // Tant que le choix n'est pas fait, la fiche n'est pas renvoyée.
  const { api, sent } = fakeApi();
  await syncOnce(api);
  expect(sent).toHaveLength(0);
});

test("conflit : garder ma version", async () => {
  const s = await conflicted();
  await keepMine(s.id);
  expect(await getShipment(s.id)).toMatchObject({ syncState: "pending", notes: "ma version", version: 5 });
  const { api, sent } = fakeApi();
  await syncOnce(api);
  expect(sent[0][0].baseVersion).toBe(5);
  expect(await getShipment(s.id)).toMatchObject({ syncState: "synced", version: 6 });
  expect(await getConflict(s.id)).toBeUndefined();
});

test("conflit : prendre la version du serveur", async () => {
  const s = await conflicted();
  await takeServer(s.id);
  const got = (await getShipment(s.id)) as Shipment;
  expect(got).toMatchObject({ syncState: "synced", notes: "version du serveur", version: 5 });
  expect(got.destinationId).toBeUndefined();
  expect(await db.outbox.count()).toBe(0);
});

test("refus du serveur : la fiche est marquée en erreur et n'est pas renvoyée en boucle", async () => {
  const s = newShipment();
  await saveShipment(s);
  await syncOnce(fakeApi({ answer: () => ({ status: "rejected", errors: ["Produit introuvable sur le serveur."] }) }).api);
  expect((await getShipment(s.id))?.syncState).toBe("error");
  expect((await db.outbox.toArray())[0]).toMatchObject({ attempts: 1, lastError: "Produit introuvable sur le serveur." });
  const { api, sent } = fakeApi();
  await syncOnce(api);
  expect(sent).toHaveLength(0);
});

test("réception : applique ce qui vient d'ailleurs, sauf par-dessus une modification locale", async () => {
  const mine = newShipment();
  await saveShipment({ ...mine, notes: "en cours ici" });
  const other = { ...newShipment(), notes: "créée sur le téléphone", version: 3, depotDate: null };
  const changes = [
    { entityType: "shipment", data: other },
    { entityType: "shipment", data: { ...mine, notes: "modifiée ailleurs", version: 9 } },
    { entityType: "product", data: { ...pondu, version: 2, grossWeightPerCartonG: null } },
  ];
  // Le faux serveur refuse l'envoi pour que la modification locale reste en attente pendant la réception.
  const stats = await syncOnce(fakeApi({ changes, cursor: 42, answer: () => ({ status: "rejected", errors: ["x"] }) }).api);
  expect(stats.pulled).toBe(2);
  expect(await getShipment(other.id)).toMatchObject({ notes: "créée sur le téléphone", version: 3, syncState: "synced" });
  expect((await getShipment(mine.id))?.notes).toBe("en cours ici");
  expect((await db.products.get("p1"))?.version).toBe(2);
  expect(await getMeta("cursor")).toBe(42);
});
