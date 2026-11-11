import { expect, test } from "vitest";
import type { Container, ContainerItem, Shipment } from "./types";
import { cartonWeightG, containerTotals, formatKg, parseQuantity, parseWeightToGrams, shipmentTotals } from "./weights";

const item = (unitWeightG: number, quantityCartons: number): ContainerItem => ({
  id: crypto.randomUUID(), productId: "p", productName: "x", designation: "x", quantityCartons, unitWeightG, weightType: "net",
});
const ref: Container = {
  id: "c", containerNumber: "", sealNumber: "",
  items: [item(20000, 381), item(20000, 104), item(15000, 590), item(15000, 42), item(15000, 143), item(15000, 153)],
};
const sp = (s: string) => s.replace(/\s/g, " ");

test("fiche de référence du client", () => {
  expect(containerTotals(ref)).toEqual({ cartons: 1413, weightG: 23_620_000 });
  expect(sp(formatKg(23_620_000))).toBe("23 620");
});

test("poids du carton", () => {
  expect(cartonWeightG({ packageWeightG: 500, packagesPerCarton: 30, weightType: "net" })).toBe(15000);
  expect(cartonWeightG({ packageWeightG: 1000, packagesPerCarton: 15, grossWeightPerCartonG: 15800, weightType: "gross" })).toBe(15800);
});

test("kg non entiers", () => {
  expect(formatKg(630_500)).toBe("630,5");
});

test("saisie de poids", () => {
  expect(parseWeightToGrams("0,5", "kg")).toBe(500);
  expect(parseWeightToGrams("500", "g")).toBe(500);
  expect(parseWeightToGrams(" 1 ", "kg")).toBe(1000);
  for (const bad of ["", "abc", "0", "-2"]) expect(parseWeightToGrams(bad, "kg")).toBeNull();
});

test("saisie de quantité", () => {
  expect(parseQuantity("381")).toBe(381);
  expect(parseQuantity("12,5")).toBe(12);
  expect(parseQuantity("1e9")).toBe(1);
  expect(parseQuantity("-3")).toBe(0);
  expect(parseQuantity("")).toBe(0);
  expect(parseQuantity("99999999")).toBe(999_999);
});

test("expédition vide", () => {
  expect(shipmentTotals({ containers: [] } as unknown as Shipment)).toEqual({ cartons: 0, weightG: 0 });
});
