import ExcelJS from "exceljs";
import { type DocData, LABELS } from "./model";

const thin = { style: "thin" as const };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const INT = "#,##0";
const KG = '#,##0.### "kg"';

function boxed(row: ExcelJS.Row, bold = false) {
  for (const col of [1, 2]) {
    const cell = row.getCell(col);
    cell.border = BORDER;
    if (bold) cell.font = { bold: true };
  }
}

/** Une feuille par conteneur, puis « Récapitulatif » pour le document global. Les totaux sont des nombres, pas du texte. */
export function buildWorkbook(data: DocData): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  data.sheets.forEach((s, i) => {
    const ws = wb.addWorksheet(`Conteneur ${i + 1}`);
    ws.columns = [{ width: 46 }, { width: 26 }];
    for (const [k, v] of [
      [LABELS.destination, s.destination], [LABELS.depot, s.depotDate], [LABELS.departure, s.departureDate],
      [LABELS.seal, s.sealNumber], [LABELS.container, s.containerNumber],
    ]) ws.addRow([`${k} :`, v]).font = { bold: true };
    ws.addRow([]);
    const head = ws.addRow([LABELS.designation, LABELS.cartons]);
    boxed(head, true);
    head.alignment = { horizontal: "center" };
    for (const r of s.rows) {
      const row = ws.addRow([r.designation, r.cartons]);
      boxed(row);
      row.getCell(2).numFmt = INT;
    }
    const cartons = ws.addRow([LABELS.totalCartons, s.totalCartons]);
    boxed(cartons, true);
    cartons.getCell(2).numFmt = '#,##0 "cartons"';
    const weight = ws.addRow([LABELS.totalWeight, s.totalWeightG / 1000]);
    boxed(weight, true);
    weight.getCell(2).numFmt = KG;
    ws.getColumn(2).alignment = { horizontal: "center" };
  });
  if (data.summary) {
    const ws = wb.addWorksheet("Récapitulatif");
    ws.columns = [{ width: 46 }, { width: 26 }];
    boxed(ws.addRow([LABELS.summary, ""]), true);
    boxed(ws.addRow([LABELS.summaryContainers, data.summary.containers]), true);
    const cartons = ws.addRow([LABELS.totalCartons, data.summary.cartons]);
    boxed(cartons, true);
    cartons.getCell(2).numFmt = '#,##0 "cartons"';
    const weight = ws.addRow([LABELS.summaryWeight, data.summary.weightG / 1000]);
    boxed(weight, true);
    weight.getCell(2).numFmt = KG;
    ws.getColumn(2).alignment = { horizontal: "center" };
  }
  return wb;
}
