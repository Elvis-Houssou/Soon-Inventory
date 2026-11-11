import "fake-indexeddb/auto";
import ExcelJS from "exceljs";
import { beforeEach, expect, test } from "vitest";
import { db } from "../db/db";
import { listDocuments, saveDocumentVersion } from "../db/repo";
import { addContainer, newShipment, updateContainer } from "../domain/shipment";
import type { ContainerItem, Shipment } from "../domain/types";
import { buildWorkbook } from "./excel";
import { buildDocument, dateLabel } from "./model";
import { buildPdf } from "./pdf";

const REF: [string, number, number][] = [
  ["LONG BOBOLO 1 kg × 20 pkts", 20000, 381], ["ROUND BOBOLO 1 kg × 20 pkts", 20000, 104], ["PONDU 1 kg × 15 pkts", 15000, 590],
  ["PONDU 500 g × 30 pkts", 15000, 42], ["SOUR SOUR LEAF 1 kg × 15 pkts", 15000, 143], ["PONDU CAOUTCHOUC 1 kg × 15 pkts", 15000, 153],
];
const items = (): ContainerItem[] =>
  REF.map(([designation, unitWeightG, quantityCartons], i) => ({
    id: `i${i}`, productId: `p${i}`, productName: designation, designation, quantityCartons, unitWeightG, weightType: "net",
  }));

function reference(): Shipment {
  let s: Shipment = { ...newShipment(), depotDate: "2026-03-26", departureDate: "2026-04-13" };
  s = updateContainer(s, s.containers[0].id, { containerNumber: "hlbu 995319 0", sealNumber: "HLC 3784425" });
  return { ...s, containers: [{ ...s.containers[0], items: items() }] };
}

test("date du document de référence", () => {
  expect(dateLabel("2026-03-26")).toBe("JEUDI, 26/03/2026");
  expect(dateLabel("2026-04-13")).toBe("LUNDI, 13/04/2026");
  expect(dateLabel(undefined)).toBe("—");
});

test("fiche individuelle fidèle à la référence", () => {
  const s = reference();
  const d = buildDocument(s, "UK", s.containers[0].id);
  expect(d.summary).toBeUndefined();
  expect(d.sheets).toHaveLength(1);
  expect(d.sheets[0]).toMatchObject({
    destination: "UK", depotDate: "JEUDI, 26/03/2026", departureDate: "LUNDI, 13/04/2026",
    sealNumber: "HLC 3784425", containerNumber: "HLBU 995319 0", totalCartons: 1413, totalWeightG: 23_620_000,
  });
  expect(d.sheets[0].rows[3]).toEqual({ designation: "PONDU 500 G × 30 PKTS", cartons: 42 });
});

test("document global : plusieurs conteneurs, dates personnalisées, lignes vides écartées", () => {
  let s = addContainer(reference());
  const second = s.containers[1].id;
  s = updateContainer(s, second, { customDates: { depotDate: "2026-03-27" } });
  s = { ...s, containers: [s.containers[0], { ...s.containers[1], items: [{ ...items()[0], quantityCartons: 100 }, { ...items()[1], quantityCartons: 0 }] }] };
  const d = buildDocument(s, "UK");
  expect(d.sheets).toHaveLength(2);
  expect(d.sheets[1].depotDate).toBe("VENDREDI, 27/03/2026");
  expect(d.sheets[1].departureDate).toBe("—");
  expect(d.sheets[1].rows).toHaveLength(1);
  expect(d.summary).toEqual({ containers: 2, cartons: 1513, weightG: 25_620_000 });
});

test("PDF : un vrai fichier, paginé", () => {
  const s = reference();
  const one = buildPdf(buildDocument(s, "UK", s.containers[0].id));
  expect(one.getNumberOfPages()).toBe(1);
  expect(new TextDecoder().decode(one.output("arraybuffer").slice(0, 5))).toBe("%PDF-");

  const long: Shipment = { ...s, containers: [{ ...s.containers[0], items: Array.from({ length: 90 }, (_, i) => ({ ...items()[0], id: `x${i}` })) }] };
  expect(buildPdf(buildDocument(long, "UK", long.containers[0].id)).getNumberOfPages()).toBeGreaterThan(1);
  // Global à deux conteneurs : une page par fiche, plus le récapitulatif.
  expect(buildPdf(buildDocument(addContainer(s), "UK")).getNumberOfPages()).toBe(3);
});

test("Excel : totaux numériques et colonnes lisibles", async () => {
  const s = reference();
  const buffer = await buildWorkbook(buildDocument(s, "UK")).xlsx.writeBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  expect(wb.worksheets.map((w) => w.name)).toEqual(["Conteneur 1", "Récapitulatif"]);
  const ws = wb.worksheets[0];
  expect(ws.getColumn(1).width).toBeGreaterThanOrEqual(40);
  expect(ws.getCell("A1").value).toBe("DESTINATION :");
  expect(ws.getCell("B2").value).toBe("JEUDI, 26/03/2026");
  expect(ws.getCell("A7").value).toBe("DESIGNATION");
  expect(ws.getCell("B8").value).toBe(381);
  expect(ws.getCell("B14").value).toBe(1413);
  expect(ws.getCell("B15").value).toBe(23620);
  expect(wb.worksheets[1].getCell("B4").value).toBe(23620);
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

test("versions : identique = même version, modifié = nouvelle version, l'ancienne reste", async () => {
  const s = reference();
  const cid = s.containers[0].id;
  const v1 = await saveDocumentVersion(s.id, cid, "pdf", buildDocument(s, "UK", cid));
  const again = await saveDocumentVersion(s.id, cid, "pdf", buildDocument(s, "UK", cid));
  expect([v1.version, again.version]).toEqual([1, 1]);

  const changed = updateContainer(s, cid, { sealNumber: "HLC 0000001" });
  const v2 = await saveDocumentVersion(s.id, cid, "pdf", buildDocument(changed, "UK", cid));
  expect(v2.version).toBe(2);
  // Autre format ou document global : numérotation indépendante.
  expect((await saveDocumentVersion(s.id, cid, "xlsx", buildDocument(s, "UK", cid))).version).toBe(1);
  expect((await saveDocumentVersion(s.id, null, "pdf", buildDocument(s, "UK"))).version).toBe(1);

  const all = await listDocuments(s.id);
  expect(all).toHaveLength(4);
  expect(all.find((d) => d.version === 1 && d.format === "pdf" && d.containerId === cid)?.data.sheets[0].sealNumber).toBe("HLC 3784425");
  expect(await db.outbox.where("[entityType+entityId]").equals(["document", v2.id]).count()).toBe(1);
});
