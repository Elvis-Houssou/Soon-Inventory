// Après `next build` : liste tous les fichiers de .next/static pour que le service worker
// les mette en cache d'un coup. Sans cette liste exacte, certains modules chargés à la demande
// (PDF, Excel) manquaient hors ligne selon la page par laquelle on était entré.
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = ".next/static";
const walk = (dir) =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const files = walk("").filter((f) => f !== "precache.json").map((f) => `/_next/static/${f.replaceAll("\\", "/")}`);
writeFileSync(join(root, "precache.json"), JSON.stringify(files));
console.log(`precache: ${files.length} fichiers`);
