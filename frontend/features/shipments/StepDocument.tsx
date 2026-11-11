"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Download, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { useState } from "react";
import { listDestinations, listDocuments, saveDocumentVersion } from "@/lib/db/repo";
import { deliver, documentBlob } from "@/lib/documents/deliver";
import { buildDocument, cartonsLabel, type DocData, type DocSheet, LABELS, weightLabel } from "@/lib/documents/model";
import type { DocumentRecord } from "@/lib/domain/types";
import type { StepProps } from "./Wizard";

function Sheet({ s }: { s: DocSheet }) {
  const head: [string, string][] = [
    [LABELS.destination, s.destination], [LABELS.depot, s.depotDate], [LABELS.departure, s.departureDate],
    [LABELS.seal, s.sealNumber], [LABELS.container, s.containerNumber],
  ];
  return (
    <section className="sheet">
      <dl>
        {head.map(([k, v]) => (
          <div key={k}>
            <dt>{k} :</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <table>
        <thead>
          <tr>
            <th>{LABELS.designation}</th>
            <th>{LABELS.cartons}</th>
          </tr>
        </thead>
        <tbody>
          {s.rows.map((r) => (
            <tr key={r.designation}>
              <td>{r.designation}</td>
              <td>{cartonsLabel(r.cartons).replace(" cartons", "")}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th>{LABELS.totalCartons}</th>
            <td>{cartonsLabel(s.totalCartons)}</td>
          </tr>
          <tr>
            <th>{LABELS.totalWeight}</th>
            <td>{weightLabel(s.totalWeightG)}</td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

export function StepDocument({ shipment: s }: StepProps) {
  const destinations = useLiveQuery(() => listDestinations(), []);
  const versions = useLiveQuery(() => listDocuments(s.id), [s.id]);
  /** Index du conteneur, ou "all" pour le document global. */
  const [scope, setScope] = useState<number | "all">(0);
  const [busy, setBusy] = useState(false);

  const destName = destinations?.find((d) => d.id === s.destinationId)?.name ?? "";
  const container = scope === "all" ? undefined : (s.containers[scope] ?? s.containers[0]);
  const data: DocData = buildDocument(s, destName, container?.id);

  const scopeLabel = (containerId: string | null) => {
    if (!containerId) return "Document global";
    const i = s.containers.findIndex((c) => c.id === containerId);
    return i < 0 ? "Conteneur supprimé" : `Conteneur ${i + 1}`;
  };
  const fileName = (r: DocumentRecord<DocData>) => {
    const slug = (t: string) => t.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `inventaire-${slug(r.data.sheets[0]?.destination || "expedition")}-${slug(scopeLabel(r.containerId))}-v${r.version}.${r.format}`;
  };

  async function send(record: DocumentRecord<DocData>) {
    setBusy(true);
    try {
      await deliver(await documentBlob(record), fileName(record));
    } finally {
      setBusy(false);
    }
  }
  const exportAs = async (format: "pdf" | "xlsx") => send(await saveDocumentVersion(s.id, container?.id ?? null, format, data));

  return (
    <>
      <h2>Votre document</h2>
      <p className="muted">Voici la feuille telle qu&apos;elle sera dans le fichier.</p>
      <div className="tabs" role="tablist">
        {s.containers.map((c, i) => (
          <button key={c.id} type="button" role="tab" aria-selected={scope === i} onClick={() => setScope(i)}>
            Conteneur {i + 1}
          </button>
        ))}
        {s.containers.length > 1 && (
          <button type="button" role="tab" aria-selected={scope === "all"} onClick={() => setScope("all")}>
            Document global
          </button>
        )}
      </div>

      <div className="docactions">
        <button type="button" className="btn pri" disabled={busy} onClick={() => exportAs("pdf")}>
          <FileText className="i" aria-hidden /> Fichier PDF
        </button>
        <button type="button" className="btn dark" disabled={busy} onClick={() => exportAs("xlsx")}>
          <FileSpreadsheet className="i" aria-hidden /> Fichier Excel
        </button>
        <button type="button" className="btn ghost" onClick={() => print()}>
          <Printer className="i" aria-hidden /> Imprimer
        </button>
      </div>

      <div className="docwrap">
        {data.sheets.map((sheet, i) => (
          <Sheet key={i} s={sheet} />
        ))}
        {data.summary && (
          <section className="sheet">
            <table>
              <thead>
                <tr>
                  <th colSpan={2}>{LABELS.summary}</th>
                </tr>
              </thead>
              <tfoot>
                <tr>
                  <th>{LABELS.summaryContainers}</th>
                  <td>{data.summary.containers}</td>
                </tr>
                <tr>
                  <th>{LABELS.totalCartons}</th>
                  <td>{cartonsLabel(data.summary.cartons)}</td>
                </tr>
                <tr>
                  <th>{LABELS.summaryWeight}</th>
                  <td>{weightLabel(data.summary.weightG)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        )}
      </div>

      {!!versions?.length && (
        <section className="panel versions">
          <h3 style={{ marginBottom: 8 }}>Fichiers déjà créés</h3>
          {versions.map((v) => (
            <div className="prow" key={v.id}>
              <span className="d">
                {v.format === "pdf" ? "PDF" : "Excel"} · {scopeLabel(v.containerId)} · version {v.version}
              </span>
              <span className="muted">
                {new Date(v.generatedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
              </span>
              <button type="button" className="icon-btn" disabled={busy} aria-label={`Récupérer la version ${v.version}`} title="Récupérer ce fichier" onClick={() => send(v)}>
                <Download className="i" aria-hidden />
              </button>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
