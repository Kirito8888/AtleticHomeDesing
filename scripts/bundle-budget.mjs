#!/usr/bin/env node
// v1.8 · Presupuesto de JavaScript por página (gzip), leído de los manifiestos del build de Next.
// Uso: npm run build && node scripts/bundle-budget.mjs [--report]
// Falla (exit 1) si alguna página supera BUDGET_KB (o el suyo en OVERRIDES). Así un import pesado
// metido sin querer en una página de uso diario no pasa desapercibido.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { gzipSync } from "node:zlib";

const ROOT = path.resolve(import.meta.dirname, "..");
const NEXT = path.join(ROOT, ".next");
// Medido en la v1.8 tras cargar las gráficas en diferido: la más pesada ronda 330 KB
const BUDGET_KB = Number(process.env.BUDGET_KB ?? 380);
// Excepciones justificadas (página: KB). Vacío por ahora.
const OVERRIDES = {};

const build = JSON.parse(readFileSync(path.join(NEXT, "build-manifest.json"), "utf8"));
const root = [...(build.polyfillFiles ?? []), ...(build.rootMainFiles ?? [])];
const gz = new Map();
const size = (f) => {
  if (!gz.has(f)) gz.set(f, gzipSync(readFileSync(path.join(NEXT, f))).length);
  return gz.get(f);
};

function* manifests(dir) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) yield* manifests(p);
    else if (e === "page_client-reference-manifest.js") yield p;
  }
}

const rows = [];
for (const file of manifests(path.join(NEXT, "server", "app"))) {
  const ctx = { globalThis: {} };
  ctx.globalThis = ctx;
  vm.runInNewContext(readFileSync(file, "utf8"), ctx);
  for (const [route, m] of Object.entries(ctx.__RSC_MANIFEST)) {
    const files = new Set(root);
    for (const list of Object.values(m.entryJSFiles ?? {})) for (const f of list) files.add(f);
    const kb = Math.round([...files].reduce((a, f) => a + size(f), 0) / 1024);
    rows.push({ route, kb, budget: OVERRIDES[route] ?? BUDGET_KB });
  }
}
rows.sort((a, b) => b.kb - a.kb);
const over = rows.filter((r) => r.kb > r.budget);
if (process.argv.includes("--report") || over.length) for (const r of rows.slice(0, 15)) console.log(`${String(r.kb).padStart(5)} KB${r.kb > r.budget ? " ✘" : "  "}  ${r.route}`);
if (over.length) {
  console.error(`✘ ${over.length} página(s) por encima del presupuesto de JS (gzip)`);
  process.exit(1);
}
console.log(`✔ ${rows.length} páginas dentro del presupuesto (máx. ${rows[0]?.kb ?? 0} KB, límite ${BUDGET_KB} KB)`);
