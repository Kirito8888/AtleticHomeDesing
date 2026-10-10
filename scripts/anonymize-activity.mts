// v1.10 · Anonimiza actividades reales para los tests (ver src/lib/training/anonymize.ts).
//   npx tsx scripts/anonymize-activity.mts entrada.fit [más.gpx …] [--keep-shape] [--out e2e/fixtures/real]
// Escribe <nombre>.anon.tcx. Revisa el resultado antes de subirlo: el repositorio es público.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { anonymizeActivity } from "../src/lib/training/anonymize";

const args = process.argv.slice(2);
const keepShape = args.includes("--keep-shape");
const outIdx = args.indexOf("--out");
const out = outIdx >= 0 ? args[outIdx + 1] : "e2e/fixtures/real";
const files = args.filter((a, i) => !a.startsWith("--") && i !== outIdx + 1);
if (!files.length) {
  console.error("Uso: npx tsx scripts/anonymize-activity.mts fichero.fit [...] [--keep-shape] [--out carpeta]");
  process.exit(1);
}
mkdirSync(out, { recursive: true });
for (const f of files) {
  const { tcx, parsed } = anonymizeActivity(readFileSync(f), { keepShape });
  const dest = path.join(out, `${path.basename(f).replace(/\.[^.]+$/, "")}.anon.tcx`);
  writeFileSync(dest, tcx);
  console.log(`✔ ${dest} · ${parsed.modality} · ${parsed.distanceM ?? "?"} m · ${parsed.samples.length} puntos${keepShape ? " · forma trasladada" : " · sin GPS"}`);
}
