import type { DocumentRecord } from "../domain/types";
import type { DocData } from "./model";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Les deux librairies sont lourdes : elles ne sont chargées qu'au moment de l'export.
export async function documentBlob(record: DocumentRecord<DocData>): Promise<Blob> {
  if (record.format === "pdf") return (await import("./pdf")).buildPdf(record.data).output("blob");
  return new Blob([await (await import("./excel")).buildWorkbook(record.data).xlsx.writeBuffer()], { type: XLSX });
}

/** Sur téléphone : feuille de partage (WhatsApp, e-mail…). Ailleurs, ou si le partage est refusé : téléchargement. */
export async function deliver(blob: Blob, name: string): Promise<void> {
  const file = new File([blob], name, { type: blob.type });
  if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
