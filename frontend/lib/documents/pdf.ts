import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { cartonsLabel, type DocData, LABELS, weightLabel } from "./model";

const BLACK: [number, number, number] = [17, 17, 17];
const GREY: [number, number, number] = [237, 237, 237];

const tableStyle = {
  theme: "grid" as const,
  margin: { left: 20, right: 20 },
  styles: { font: "helvetica", fontSize: 11, textColor: BLACK, lineColor: BLACK, lineWidth: 0.3, cellPadding: 2.5 },
  headStyles: { fillColor: GREY, textColor: BLACK, fontStyle: "bold" as const, halign: "center" as const },
  footStyles: { fillColor: GREY, textColor: BLACK, fontStyle: "bold" as const },
  columnStyles: { 1: { halign: "center" as const, cellWidth: 55 } },
  showFoot: "lastPage" as const,
};

/** Une fiche par conteneur, chacune sur sa page ; les longues listes se paginent toutes seules. */
export function buildPdf(data: DocData): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  data.sheets.forEach((s, i) => {
    if (i) doc.addPage();
    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(...BLACK);
    const header: [string, string][] = [
      [LABELS.destination, s.destination], [LABELS.depot, s.depotDate], [LABELS.departure, s.departureDate],
      [LABELS.seal, s.sealNumber], [LABELS.container, s.containerNumber],
    ];
    header.forEach(([k, v], j) => {
      doc.text(`${k} :`, 20, 25 + j * 8);
      doc.text(v, 75, 25 + j * 8);
    });
    autoTable(doc, {
      ...tableStyle,
      startY: 72,
      head: [[LABELS.designation, LABELS.cartons]],
      body: s.rows.map((r) => [r.designation, cartonsLabel(r.cartons).replace(" cartons", "")]),
      foot: [
        [LABELS.totalCartons, { content: cartonsLabel(s.totalCartons), styles: { halign: "center" } }],
        [LABELS.totalWeight, { content: weightLabel(s.totalWeightG), styles: { halign: "center" } }],
      ],
    });
  });
  if (data.summary) {
    doc.addPage();
    autoTable(doc, {
      ...tableStyle,
      startY: 25,
      head: [[{ content: LABELS.summary, colSpan: 2 }]],
      body: [
        [LABELS.summaryContainers, String(data.summary.containers)],
        [LABELS.totalCartons, cartonsLabel(data.summary.cartons)],
        [LABELS.summaryWeight, weightLabel(data.summary.weightG)],
      ],
      bodyStyles: { fontStyle: "bold" },
    });
  }
  return doc;
}
