#!/usr/bin/env node
// Atlenza · Avisos de terceros: lista las dependencias de producción y su licencia
// (desde package-lock.json) en THIRD_PARTY_NOTICES.md.
//   node scripts/third-party-notices.mjs          → escribe el fichero
//   node scripts/third-party-notices.mjs --check  → falla si entra una licencia no admitida
//                                                    (la CI lo ejecuta; el listado no hace fallar)
import { readFileSync, writeFileSync } from "node:fs";

const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));

// Licencias que no se admiten: propietarias o copyleft fuerte (obligarían a publicar o impedirían el uso).
const DENY = /(SEE LICENSE|UNLICENSED|^\(none\)$|\bAGPL|(^|[^L])GPL|SSPL|BUSL|Elastic|CC-BY-NC|CC-BY-SA|Commons-Clause)/i;
// LGPL de libvips: biblioteca enlazada dinámicamente por sharp (dependencia de Next.js); se admite.
const ALLOW_LGPL = /^@img\/sharp-/;

const deps = [];
for (const [path, v] of Object.entries(lock.packages ?? {})) {
  if (!path || v.dev || v.devOptional || !path.includes("node_modules/")) continue;
  const name = path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length);
  deps.push({ name, version: v.version ?? "?", license: v.license ?? "(none)" });
}
deps.sort((a, b) => a.name.localeCompare(b.name));

const bad = deps.filter((d) => DENY.test(d.license) || (/LGPL/i.test(d.license) && !ALLOW_LGPL.test(d.name)));
if (process.argv.includes("--check")) {
  if (bad.length) {
    console.error("Licencias no admitidas en dependencias de producción:");
    for (const d of bad) console.error(`  ${d.name}@${d.version}: ${d.license}`);
    process.exit(1);
  }
  console.log(`✔ ${deps.length} dependencias de producción con licencias admitidas`);
  process.exit(0);
}

const counts = Object.entries(deps.reduce((a, d) => ((a[d.license] = (a[d.license] ?? 0) + 1), a), {})).sort((a, b) => b[1] - a[1]);
const out = `# Avisos de terceros

Atlenza (© 2026 David Ornelas Luna, ver [LICENSE](LICENSE)) usa los componentes y datos de
terceros siguientes. Cada uno se rige por su propia licencia; sus textos completos van dentro de
cada paquete (\`node_modules/<paquete>/LICENSE\`) y se conservan en la imagen de Docker.

Generado con \`npm run notices\`.

## Datos y servicios

| Fuente | Uso | Licencia / condiciones |
|---|---|---|
| [Open Food Facts](https://world.openfoodfacts.org) | Alimentos y códigos de barras (copia local de los productos usados) | Base de datos: [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) · imágenes: [CC BY-SA](https://creativecommons.org/licenses/by-sa/3.0/deed.es). © colaboradores de Open Food Facts |
| [Open-Meteo](https://open-meteo.com) | Tiempo en la pista y el día de la competición | Datos: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Uso gratuito no comercial |
| Fuentes Geist y Geist Mono (Vercel) | Tipografía | [SIL Open Font License 1.1](https://openfontlicense.org) |
| Iconos [Lucide](https://lucide.dev) | Interfaz | ISC |

Las marcas de terceros que se mencionan (Garmin, Strava, Apple Health, Google, etc.) pertenecen
a sus titulares; se citan solo para indicar compatibilidad, sin vinculación con ellos.

## Bibliotecas de producción (${deps.length})

Resumen: ${counts.map(([l, n]) => `${l} (${n})`).join(" · ")}

| Paquete | Versión | Licencia |
|---|---|---|
${deps.map((d) => `| ${d.name} | ${d.version} | ${d.license} |`).join("\n")}
`;
writeFileSync(new URL("../THIRD_PARTY_NOTICES.md", import.meta.url), out);
console.log(`THIRD_PARTY_NOTICES.md: ${deps.length} dependencias`);
