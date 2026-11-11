"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/db";
import { useOnline } from "@/lib/pwa";
import { useSync } from "@/lib/sync/manager";

/** Un seul message à la fois, du plus urgent au plus rassurant. */
export function SyncIndicator() {
  const online = useOnline();
  const { account, status } = useSync();
  const pending = useLiveQuery(() => db.outbox.count(), []) ?? 0;
  const conflicts = useLiveQuery(() => db.shipments.filter((s) => s.syncState === "conflict").count(), []) ?? 0;

  const refused = useLiveQuery(() => db.outbox.filter((e) => !!e.lastError).count(), []) ?? 0;

  let tone = "";
  let text = "Enregistré sur cet appareil";
  if (conflicts) [tone, text] = ["off", `${conflicts} fiche${conflicts > 1 ? "s" : ""} à vérifier`];
  else if (account && refused) [tone, text] = ["off", `${refused} envoi${refused > 1 ? "s" : ""} refusé${refused > 1 ? "s" : ""}`];
  else if (!online) [tone, text] = ["off", "Hors ligne · enregistré sur cet appareil"];
  else if (account && status === "syncing") text = "Envoi en cours…";
  else if (account && status === "error") [tone, text] = ["off", "Envoi impossible pour l'instant"];
  else if (account && pending) text = "En attente d'envoi";
  else if (account) text = "Sauvegardé sur le serveur";

  return (
    <span className={`pill sync ${tone}`} role="status">
      <span className="dot" />
      {text}
    </span>
  );
}
