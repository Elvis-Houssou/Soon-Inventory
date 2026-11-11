import "fake-indexeddb/auto";
import { beforeEach, expect, test } from "vitest";
import { newShipment, updateContainer } from "../domain/shipment";
import type { Product } from "../domain/types";
import { db } from "./db";
import { deleteShipment, getShipment, listProducts, listShipments, saveProduct, saveShipment } from "./repo";

const pondu: Product = {
  id: "p1", name: "PONDU", designation: "PONDU 1 kg × 15 pkts", packageWeightG: 1000, packagesPerCarton: 15,
  weightType: "net", unitLabel: "pkts", isActive: true, version: 0, syncState: "local", updatedAt: "",
};

beforeEach(async () => {
  await db.delete();
  await db.open();
});

test("enregistrer puis relire", async () => {
  const s = newShipment();
  await saveShipment(s);
  expect((await getShipment(s.id))?.containers).toHaveLength(1);
});

test("une seule entrée d'outbox par expédition, clé renouvelée", async () => {
  const s = newShipment();
  await saveShipment(s);
  const k1 = (await db.outbox.toArray())[0].id;
  await saveShipment({ ...s, notes: "x" });
  const all = await db.outbox.toArray();
  expect(all).toHaveLength(1);
  expect(all[0]).toMatchObject({ entityType: "shipment", entityId: s.id, op: "upsert", attempts: 0 });
  expect(all[0].id).not.toBe(k1);
});

test("état de synchronisation", async () => {
  const s = newShipment();
  await saveShipment(s);
  expect((await getShipment(s.id))?.syncState).toBe("pending");
});

test("suppression synchronisable", async () => {
  const s = newShipment();
  await saveShipment(s);
  await deleteShipment(s.id);
  expect(await listShipments()).toHaveLength(0);
  expect((await getShipment(s.id))?.deletedAt).toBeTruthy();
  expect((await db.outbox.toArray())[0].op).toBe("delete");
});

test("recherche par numéro de conteneur", async () => {
  let s = newShipment();
  s = updateContainer(s, s.containers[0].id, { containerNumber: "HLBU 995319 0" });
  await saveShipment(s);
  expect(await db.shipments.where("containerNumbers").equals("HLBU 995319 0").count()).toBe(1);
});

test("produits actifs seulement", async () => {
  await saveProduct({ ...pondu, id: "a" });
  await saveProduct({ ...pondu, id: "b", designation: "X", isActive: false });
  expect(await listProducts({ activeOnly: true })).toHaveLength(1);
});
