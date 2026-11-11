import { readdirSync } from "node:fs";
import { join } from "node:path";

// Liste de tous les fichiers du build, pour que le service worker les mette en cache d'un coup.
// Calculée une seule fois pendant `next build` (les fichiers sont déjà écrits à ce moment-là), puis servie comme un fichier statique.
// Une liste écrite après le build n'était pas publiée par Vercel.

const ROOT = join(process.cwd(), ".next", "static");

function walk(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

export function GET() {
  return Response.json(walk("").map((f) => `/_next/static/${f.replaceAll("\\", "/")}`));
}
