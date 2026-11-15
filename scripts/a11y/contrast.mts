// v3.0 F · V3-A10: contraste de todos los pares de tokens en claro, oscuro y .hc. Falla (exit 1) si
// un texto baja de 4,5:1 o un componente/gráfico de 3:1. Uso: npm run a11y:contrast [-- --all]
import { readFileSync } from "node:fs";

import { checkTheme, cssVars, PAIRS, THEMES } from "../../src/lib/a11y/contrast";

const css = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");
const all = process.argv.includes("--all");
let fail = 0;
for (const t of THEMES) {
  const vars = Object.assign({}, ...t.base.map((s) => cssVars(css, s)));
  const res = checkTheme(vars, t.name, t.dark, PAIRS);
  const bad = res.filter((r) => !r.ok);
  console.log(`\n${t.name}: ${res.length - bad.length}/${res.length} pares en regla`);
  for (const r of all ? res : bad) {
    const tag = r.ok ? "ok   " : r.warn ? "AVISO" : r.defer ? `EXC-${r.defer}` : "FALLA";
    console.log(`  ${tag} ${r.fg} sobre ${r.bg}: ${r.ratio.toFixed(2)}:1 (mín. ${r.min})${r.note ? ` · ${r.note}` : ""}`);
  }
  fail += bad.filter((r) => !r.warn && !r.defer).length;
}
if (fail) {
  console.error(`\n${fail} pares por debajo del mínimo`);
  process.exit(1);
}
console.log("\nContraste de tokens en regla en los 4 temas");
