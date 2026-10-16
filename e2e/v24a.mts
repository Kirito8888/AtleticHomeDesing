// v2.4 bloque 1: TTFB por ruta a 390 px, claro y oscuro, con una sesión sintética completa (fuerza, técnica, pista).
// Solo mide: no cambia código de producto ni falla por umbrales (sí por 5xx, errores de página o ruta sin cifra).
//   BASE_URL=http://localhost:3100 npm run e2e:v24a
// Opciones: TTFB_RUNS=5 (visitas medidas por ruta) · TTFB_QUERIES=1 (cuenta consultas de Postgres por ruta, solo BD de dev)
//           TTFB_OUT=docs/ttfb-v2-4.md (escribe la tabla entre los marcadores, sin tocar el resto del fichero)
// El tema (next-themes, clase) se decide en el cliente: el HTML del servidor es el mismo en claro y oscuro,
// así que la columna «oscuro» actúa de réplica y de control de ruido.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, openSync, readSync, closeSync, writeFileSync } from "node:fs";

import { chromium, type BrowserContext, type Page } from "playwright-core";

const out = process.env.SHOTS_DIR ?? "e2e/screenshots";
mkdirSync(out, { recursive: true });
const B = process.env.BASE_URL ?? "http://localhost:3000";
const RUNS = Math.max(1, Number(process.env.TTFB_RUNS) || 5);
const QUERIES = process.env.TTFB_QUERIES === "1";
const PG_LOG = process.env.PG_LOG ?? "/tmp/lifeos-pg/log";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const newCtx = async (ip: string, scheme: "light" | "dark") =>
  browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "es-ES",
    hasTouch: true,
    isMobile: true,
    colorScheme: scheme,
    extraHTTPHeaders: { "x-forwarded-for": ip },
  });
const watch = (p: Page) =>
  p.on("pageerror", (e) => errors.push(`pageerror ${p.url()}: ${e.message}`));
const newUser = (email: string, name: string, role: string) => {
  const o = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", name, "--role", role, "--accept-terms"], { encoding: "utf8" });
  const pw = o.match(/Contraseña: (\S+)/)?.[1];
  if (!pw) throw new Error(`no se pudo crear ${email}`);
  return pw;
};
const login = async (p: Page, email: string, pw: string) => {
  await p.goto(B + "/login", { waitUntil: "load" });
  await p.fill("#email", email);
  await p.fill("#password", pw);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login")), p.click("button[type=submit]")]);
};
const api = <T = unknown,>(p: Page, method: string, url: string, body?: unknown) =>
  p.evaluate(
    async ([m, u, b]) => {
      const r = await fetch(u as string, { method: m as string, headers: { "content-type": "application/json" }, body: b ? JSON.stringify(b) : undefined });
      let json: unknown = null;
      try { json = await r.json(); } catch { /* sin cuerpo */ }
      return { status: r.status, json };
    },
    [method, url, body] as const,
  ) as Promise<{ status: number; json: T }>;

// ---------- Datos sintéticos ----------
const stamp = Date.now();
const mail = (k: string) => `v24a-${k}-${stamp}@e2e.test`;
const pw = { at: newUser(mail("at"), "Atleta v24a", "ATHLETE"), co: newUser(mail("co"), "Entrenadora v24a", "COACH") };
const day = (back: number) => new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10);

const seedCtx = await newCtx("198.51.100.230", "light");
const seed = await seedCtx.newPage();
watch(seed);
await login(seed, mail("at"), pw.at);
await seed.goto(B + "/", { waitUntil: "load" });

const prof = await api(seed, "PATCH", "/api/profile", { primaryEvent: "jabalina", sex: "FEMALE", heightCm: 172, bodyWeightKg: 68 });
if (prof.status >= 400) console.log(`aviso: perfil ${prof.status} (se sigue sin especialidad)`);
const ex = await api<{ id: string }[]>(seed, "GET", "/api/training/exercises");
const exIds = (Array.isArray(ex.json) ? ex.json : []).slice(0, 12).map((e) => e.id);
if (exIds.length < 3) errors.push("no hay ejercicios en el catálogo para sembrar fuerza");

const sessionIds: Record<string, string> = {};
const HIST = 180;
for (let i = 0; i < HIST; i++) {
  const k = i % 3;
  const base = { date: day(HIST - i), status: "COMPLETED", durationSec: 3000 + (i % 7) * 300, sessionRpe: 5 + (i % 4) };
  const body =
    k === 0
      ? { ...base, type: "STRENGTH", discipline: "THROWS", strength: { bodyWeightKg: 70, sets: exIds.slice(0, 4).flatMap((id, j) => [0, 1, 2].map((s) => ({ exerciseId: id, reps: 5 + s, weightKg: 40 + j * 10 + (i % 9), rpe: 7 + (s % 2) }))) } }
      : k === 1
        ? { ...base, type: "TECHNICAL", discipline: "THROWS", technical: { event: "JAVELIN", implementWeightG: 800, windMs: 1.2, attempts: Array.from({ length: 8 }, (_, a) => ({ markM: 48 + ((i + a * 3) % 12) + a / 10, windMs: 0.5 })) } }
        : { ...base, type: "TRACK", track: { modality: "SPRINT", surface: "TRACK", distanceM: 1800, movingTimeSec: 1500, hrAvg: 150, hrMax: 182, intervals: Array.from({ length: 6 }, (_, r) => ({ repetition: r + 1, distanceM: 200, timeSec: 27 + (r % 3) * 0.4, recoverySec: 120, splitsSec: [13.1, 13.9] })) } };
  const r = await api<{ id: string }>(seed, "POST", "/api/training/sessions", body);
  if (r.status !== 201 && r.status !== 200) {
    errors.push(`sembrar sesión ${body.type} → ${r.status}`);
    continue;
  }
  if (i >= HIST - 3) sessionIds[body.type] = r.json.id; // las últimas de cada tipo
}
for (let m = 0; m < 6; m++) {
  await api(seed, "POST", "/api/training/tests", { test: "custom", customName: "Salto sintético", customUnit: "cm", value: 40 + m, date: day(150 - m * 25) });
}
await api(seed, "POST", "/api/goals", { kind: "CUSTOM", title: "Marca de temporada", target: 60, current: 55, unit: "m", higherIsBetter: true });
await api(seed, "POST", "/api/planning/events", { type: "COMPETITION", title: "Control sintético", startAt: new Date(Date.now() + 20 * 86_400_000).toISOString(), location: "Pista" });
await api(seed, "POST", "/api/nutrition/goals", { effectiveFrom: "2026-01-01", kcal: 2800, proteinG: 150, carbsG: 330, fatG: 80 });
await api(seed, "POST", "/api/finance/accounts", { name: "Banco", type: "ASSET", openingBalanceCents: 100000 });
log(`datos sintéticos: ${HIST} sesiones (fuerza, técnica, pista) + tests, objetivo, competición, nutrición y finanzas`);
await seedCtx.close();

// ---------- Rutas ----------
type Who = "at" | "co" | "anon";
type Route = { url: string; who: Who; skip?: string; label?: string };
const STATIC = [
  "/", "/glance", "/goals", "/notifications", "/review", "/safety", "/search", "/share", "/about", "/welcome",
  "/finance", "/finance/trips", "/nutrition", "/nutrition/micros", "/nutrition/plan", "/nutrition/recipes", "/nutrition/shopping", "/nutrition/sweat",
  "/planning", "/planning/plan/new", "/planning/week-all",
  "/recovery", "/recovery/body", "/recovery/fisio", "/recovery/health", "/recovery/trends", "/recovery/wellbeing", "/recovery/women",
  "/study", "/study/ask", "/study/assignments", "/study/exam", "/study/exams", "/study/focus", "/study/plan", "/study/schedule",
  "/training", "/training/new", "/training/compare", "/training/diary", "/training/equipment", "/training/exercises", "/training/javelin",
  "/training/performance", "/training/prehab", "/training/rm", "/training/routine", "/training/seasons", "/training/tests",
  "/training/tests/comparar", "/training/tests/curvas", "/training/tests/salto",
  "/settings", "/settings/privacy", "/settings/trash", "/clubs", "/print/season",
];
const routes: Route[] = STATIC.map((url) => ({ url, who: "at" as Who }));
const strengthId = sessionIds.STRENGTH;
for (const [url, id] of [["/training/[id] (fuerza)", strengthId], ["/training/[id] (técnica)", sessionIds.TECHNICAL], ["/training/[id] (pista)", sessionIds.TRACK]] as const) {
  routes.push(id ? { url: `/training/${id}`, who: "at", label: url } : { url, who: "at", skip: "sin sesión sembrada" });
}
if (strengthId) routes.push({ url: `/training/${strengthId}/edit`, who: "at", label: "/training/[id]/edit" });
if (exIds[0]) routes.push({ url: `/training/exercises/${exIds[0]}`, who: "at", label: "/training/exercises/[id]" });
for (const [url, why] of [
  ["/training/routine/[id]", "requiere cuestionario de rutina completo"],
  ["/planning/plan/[id]", "requiere un plan importado del PDF"],
  ["/planning/plan/[id]/edit", "requiere un plan importado del PDF"],
  ["/planning/competition/[id]", "requiere competición con plan"],
  ["/planning/meso/[code]", "requiere un plan importado del PDF"],
  ["/print/plan/[id]", "requiere un plan importado del PDF"],
  ["/clubs/[id]", "requiere club con miembros"],
  ["/recovery/fisio/[id]", "requiere protocolo de fisio"],
  ["/recovery/fisio/compartido/[shareId]", "requiere protocolo compartido"],
  ["/coach/session/[id]", "requiere atleta vinculada a la entrenadora"],
  ["/admin", "exige 2FA"],
] as const) routes.push({ url, who: "at", skip: `no medida: ${why}` });
routes.push({ url: "/coach", who: "co" });
routes.push({ url: "/coach/multi", who: "co" });
for (const url of ["/login", "/register", "/reset", "/legal/aviso", "/legal/condiciones", "/legal/privacidad", "/offline"]) routes.push({ url, who: "anon" });

// ---------- Medida ----------
type Stat = { cold: number; med: number; p90: number; status: number; redirects: number; runs: number[] };
type Res = { url: string; label?: string; skip?: string; light?: Stat; dark?: Stat; queries?: number; dbMs?: number; top?: string[] };
const results = new Map<string, Res>(routes.map((r) => [r.url, { url: r.url, label: r.label, skip: r.skip }]));
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor((s.length - 1) / 2)]; };
const p90 = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(s.length * 0.9) - 1)]; };

const visit = async (p: Page, url: string) => {
  const resp = await p.goto(B + url, { waitUntil: "domcontentloaded" });
  const t = await p.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    return { ttfb: n.responseStart - n.requestStart, redirects: n.redirectCount };
  });
  return { ttfb: t.ttfb, redirects: t.redirects, status: resp?.status() ?? 0 };
};
const measure = async (p: Page, url: string): Promise<Stat> => {
  const first = await visit(p, url); // «frío»: primera visita de la sesión a la ruta
  const runs: number[] = [];
  let last = first;
  for (let i = 0; i < RUNS; i++) {
    last = await visit(p, url);
    runs.push(last.ttfb);
  }
  return { cold: first.ttfb, med: median(runs), p90: p90(runs), status: last.status, redirects: last.redirects, runs };
};

const ctxs: Record<string, BrowserContext> = {};
const pages: Record<string, Page> = {};
for (const [i, scheme] of (["light", "dark"] as const).entries()) {
  for (const [j, who] of (["at", "co", "anon"] as const).entries()) {
    const c = await newCtx(`198.51.100.${232 + i * 3 + j}`, scheme);
    const p = await c.newPage();
    watch(p);
    if (who !== "anon") await login(p, mail(who), who === "at" ? pw.at : pw.co);
    ctxs[`${who}-${scheme}`] = c;
    pages[`${who}-${scheme}`] = p;
  }
}
for (const scheme of ["light", "dark"] as const) {
  for (const r of routes) {
    if (r.skip) continue;
    const st = await measure(pages[`${r.who}-${scheme}`], r.url);
    results.get(r.url)![scheme] = st;
  }
  log(`TTFB medido en ${scheme}`);
}

// ---------- Consultas por ruta (opcional) ----------
const dbUrl = (process.env.DATABASE_URL ?? "").replace(/\?.*$/, "");
const psql = (sql: string) => execFileSync("psql", [dbUrl, "-qAt", "-c", sql], { encoding: "utf8" });
const readFrom = (offset: number) => {
  const size = statSync(PG_LOG).size;
  const buf = Buffer.alloc(Math.max(0, size - offset));
  const fd = openSync(PG_LOG, "r");
  readSync(fd, buf, 0, buf.length, offset);
  closeSync(fd);
  return buf.toString("utf8");
};
if (QUERIES) {
  if (!existsSync(PG_LOG) || !dbUrl) {
    console.log(`aviso: sin log de Postgres (${PG_LOG}); se omiten las consultas`);
  } else {
    try {
      psql("ALTER SYSTEM SET log_min_duration_statement = 0");
      psql("SELECT pg_reload_conf()");
      await new Promise((r) => setTimeout(r, 500));
      for (const r of routes) {
        if (r.skip) continue;
        const p = pages[`${r.who}-light`];
        // Solo el render del servidor: se cortan los fetch de cliente a /api/ para no contarlos
        await p.route("**/api/**", (rt) => rt.abort());
        await p.goto(B + r.url, { waitUntil: "load" }); // calienta (sin contar)
        await p.waitForTimeout(150);
        const off = statSync(PG_LOG).size;
        await p.goto(B + r.url, { waitUntil: "load" });
        await p.waitForTimeout(250);
        const text = readFrom(off);
        const stm = [...text.matchAll(/duration: ([\d.]+) ms\s+(?:execute [^:]*|statement): ([^\n]*)/g)]
          .filter((m) => !/^(BEGIN|COMMIT|ROLLBACK|SELECT pg_|SET |DEALLOCATE)/i.test(m[2]));
        const res = results.get(r.url)!;
        await p.unroute("**/api/**");
        res.queries = stm.length;
        res.dbMs = Math.round(stm.reduce((s, m) => s + Number(m[1]), 0) * 10) / 10;
        const agg = new Map<string, { n: number; ms: number }>();
        for (const m of stm) {
          const key = m[2].replace(/\$\d+/g, "$").replace(/\s+/g, " ").replace(/"public"\./g, "").slice(0, 110);
          const a = agg.get(key) ?? { n: 0, ms: 0 };
          a.n++; a.ms += Number(m[1]);
          agg.set(key, a);
        }
        res.top = [...agg.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 3).map(([k, v]) => `${v.n}× ${v.ms.toFixed(1)} ms · ${k}`);
      }
      log("consultas por ruta contadas");
    } finally {
      psql("ALTER SYSTEM RESET log_min_duration_statement");
      psql("SELECT pg_reload_conf()");
    }
  }
}

// ---------- Salida ----------
const f = (n?: number) => (n == null ? "—" : n.toFixed(0));
const rows = [...results.values()];
for (const r of rows) {
  if (r.skip) continue;
  for (const s of ["light", "dark"] as const) {
    const st = r[s];
    if (!st) errors.push(`${r.url} (${s}): sin cifra`);
    else if (st.status >= 500) errors.push(`${r.url} (${s}): HTTP ${st.status}`);
  }
}
const measured = rows.filter((r) => !r.skip).sort((a, b) => (b.light?.med ?? 0) - (a.light?.med ?? 0));
const skipped = rows.filter((r) => r.skip);
const cell = (s?: Stat) => (s ? `${f(s.med)} / ${f(s.p90)}` : "—");
let md = `| Ruta | HTTP | Frío (ms) | Claro mediana / p90 | Oscuro mediana / p90 | Consultas SSR | ms BD |\n|---|---|---|---|---|---|---|\n`;
for (const r of measured) {
  const st = r.light;
  const http = st ? `${st.status}${st.redirects ? ` (↪${st.redirects})` : ""}` : "—";
  md += `| \`${r.label ?? r.url}\` | ${http} | ${f(st?.cold)} | ${cell(r.light)} | ${cell(r.dark)} | ${r.queries ?? "—"} | ${r.dbMs ?? "—"} |\n`;
}
if (skipped.length) md += `\nNo medidas:\n${skipped.map((r) => `- \`${r.url}\`: ${r.skip}`).join("\n")}\n`;
const tops = measured.filter((r) => r.top?.length).slice(0, 10);
if (tops.length) md += `\nSentencias más caras de las 10 rutas más lentas:\n${tops.map((r) => `- \`${r.label ?? r.url}\`\n${r.top!.map((t) => `  - ${t}`).join("\n")}`).join("\n")}\n`;
writeFileSync(`${out}/ttfb.md`, md);
writeFileSync(`${out}/ttfb.json`, JSON.stringify(rows, null, 1));
if (process.env.TTFB_OUT) {
  const a = "<!-- ttfb:start -->", z = "<!-- ttfb:end -->";
  const cur = existsSync(process.env.TTFB_OUT) ? readFileSync(process.env.TTFB_OUT, "utf8") : `${a}\n${z}\n`;
  const i = cur.indexOf(a), j = cur.indexOf(z);
  const head = `Medido el ${new Date().toISOString().slice(0, 10)} con ${RUNS} visitas por ruta, 390×844, sesión sintética de ${HIST} entrenos.\n\n`;
  writeFileSync(process.env.TTFB_OUT, i >= 0 && j > i ? `${cur.slice(0, i + a.length)}\n${head}${md}${cur.slice(j)}` : `${cur}\n${a}\n${head}${md}${z}\n`);
}
console.log(md.split("\n").slice(0, 14).join("\n"));
await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v24a");
