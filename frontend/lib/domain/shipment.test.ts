import { expect, test } from "vitest";
import { designation } from "./product";
import {
  addItem, duplicateContainer, duplicateShipment, effectiveDates, newShipment, removeContainer, setQuantity,
  updateContainer, validateShipment,
} from "./shipment";
import type { Product, Shipment } from "./types";

const pondu: Product = {
  id: "p1", name: "PONDU", designation: "PONDU 1 kg × 15 pkts", packageWeightG: 1000, packagesPerCarton: 15,
  weightType: "net", unitLabel: "pkts", isActive: true, version: 0, syncState: "local", updatedAt: "",
};

test("désignation", () => {
  expect(designation("PONDU", 500, 30, "pkts")).toBe("PONDU 500 g × 30 pkts");
  expect(designation("PONDU", 1000, 15, "pkts")).toBe("PONDU 1 kg × 15 pkts");
});

test("un produit, une ligne par conteneur", () => {
  const s0 = newShipment();
  const cid = s0.containers[0].id;
  const a = addItem(s0, cid, pondu);
  const b = addItem(a.shipment, cid, pondu);
  expect(b.shipment.containers[0].items).toHaveLength(1);
  expect(b.index).toBe(0);
});

test("la ligne garde son poids si le produit change", () => {
  const s0 = newShipment();
  const { shipment } = addItem(s0, s0.containers[0].id, pondu);
  pondu.packagesPerCarton = 99;
  expect(shipment.containers[0].items[0].unitWeightG).toBe(15000);
  expect(shipment.containers[0].items[0].designation).toBe("PONDU 1 kg × 15 pkts");
  pondu.packagesPerCarton = 15;
});

test("duplication de conteneur", () => {
  let s = newShipment();
  const cid = s.containers[0].id;
  s = updateContainer(s, cid, { containerNumber: "HLBU 995319 0", sealNumber: "HLC 3784425" });
  s = addItem(s, cid, pondu).shipment;
  s = setQuantity(s, cid, s.containers[0].items[0].id, 590);
  const d = duplicateContainer(s, cid);
  expect(d.containers).toHaveLength(2);
  expect(d.containers[1].id).not.toBe(cid);
  expect(d.containers[1].containerNumber).toBe("");
  expect(d.containers[1].sealNumber).toBe("");
  expect(d.containers[1].items[0].quantityCartons).toBe(590);
  expect(d.containers[1].items[0].id).not.toBe(d.containers[0].items[0].id);
  expect(d.containerNumbers).toEqual(["HLBU 995319 0"]);
});

test("le dernier conteneur ne se supprime pas", () => {
  const s = newShipment();
  expect(removeContainer(s, s.containers[0].id).containers).toHaveLength(1);
});

test("dates héritées ou personnalisées", () => {
  let s: Shipment = { ...newShipment(), depotDate: "2026-03-26", departureDate: "2026-04-13" };
  expect(effectiveDates(s, s.containers[0])).toEqual({ depotDate: "2026-03-26", departureDate: "2026-04-13" });
  s = updateContainer(s, s.containers[0].id, { customDates: { depotDate: "2026-03-27", departureDate: "2026-04-14" } });
  expect(effectiveDates(s, s.containers[0]).depotDate).toBe("2026-03-27");
});

test("reprise : la source ne change pas", () => {
  let src: Shipment = { ...newShipment(), reference: "A", status: "completed", depotDate: "2026-03-26", version: 4 };
  src = updateContainer(src, src.containers[0].id, { containerNumber: "HLBU 995319 0" });
  const before = structuredClone(src);
  const copy = duplicateShipment(src);
  expect(src).toEqual(before);
  expect(copy.id).not.toBe(src.id);
  expect(copy).toMatchObject({ reference: "", status: "draft", version: 0, syncState: "local" });
  expect(copy.depotDate).toBeUndefined();
  expect(copy.containers[0].containerNumber).toBe("");
});

test("alertes", () => {
  const codes = validateShipment(newShipment()).map((i) => i.code);
  expect(codes).toEqual(["destination", "dates", "container_number", "seal_number", "empty_container"]);
  const bad = { ...newShipment(), destinationId: "d", depotDate: "2026-04-13", departureDate: "2026-03-26" };
  expect(validateShipment(bad).map((i) => i.code)).toContain("dates_order");
});
