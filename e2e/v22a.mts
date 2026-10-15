// E2E de la v2.2 bloque 1 (Strava no llega a la entrenadora; métricas de administración en BD) en un móvil de 390 px.
//   BASE_URL=http://localhost:3000 npm run e2e:v22a
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import { chromium, type Page } from "playwright-core";


const out = process.env.SHOTS_DIR ?? "e2e/screenshots";
mkdirSync(out, { recursive: true });
const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let ipSeq = 100 + (Date.now() % 100);
const newPage = async () => {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": `198.51.100.${ipSeq++}` } });
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(`pageerror ${p.url()}: ${e.message}`));
  p.on("console", (m) => {
    if (m.type() === "error" && !/40[0134]|422/.test(m.text())) errors.push(`console ${p.url()}: ${m.text()}`);
  });
  p.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`);
  });
  return p;
};
const go = async (p: Page, u: string) => {
  await p.goto(B + u, { waitUntil: "load" });
  await p.waitForTimeout(300);
};
const noHScroll = async (p: Page, where: string) => {
  if (await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) errors.push(`scroll horizontal en ${where}`);
};
const call = (p: Page, method: string, url: string, body?: unknown) =>
  p.evaluate(
    async ([m, u, b]) => {
      const r = await fetch(u as string, { method: m as string, headers: { "content-type": "application/json" }, body: b ? JSON.stringify(b) : undefined });
      return { status: r.status, json: await r.json().catch(() => null) };
    },
    [method, url, body] as const,
  );
const newUser = (email: string, name: string, role: string) => {
  const out = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", name, "--role", role, "--accept-terms"], { encoding: "utf8" });
  const pw = out.match(/Contraseña: (\S+)/)?.[1];
  if (!pw) throw new Error(`no se pudo crear ${email}`);
  return pw;
};
const login = async (p: Page, email: string, pw: string) => {
  await go(p, "/login");
  await p.fill("#email", email);
  await p.fill("#password", pw);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login")), p.click("button[type=submit]")]);
};

const psql = (sql: string) => execFileSync("psql", [(process.env.DATABASE_URL ?? "").split("?")[0], "-qtAc", sql], { encoding: "utf8" }).trim();
const run = Date.now();
const mail = (k: string) => `${k}-${run}@e2e.test`;
const pw = { coa: newUser(mail("coa"), "Entrenadora v22a", "COACH"), at: newUser(mail("at"), "Atleta v22a", "ATHLETE") };

// --- Datos: vínculo activo (sesiones y carga) y dos sesiones de la atleta, una importada de Strava
const id = (k: string) => psql(`select id from "User" where email='${mail(k)}'`);
const [coachId, athleteId] = [id("coa"), id("at")];
psql(`insert into "CoachAthlete" (id, "coachId", "athleteId", status, scopes) values ('v22a-${run}', '${coachId}', '${athleteId}', 'ACTIVE', '{SESSIONS,LOAD}')`);
const mk = (sid: string, title: string, source: string) =>
  psql(`insert into "TrainingSession" (id, "userId", date, type, status, title, "durationSec", tss, source, "externalId", "updatedAt") values ('${sid}', '${athleteId}', current_date, 'STRENGTH', 'COMPLETED', '${title}', 3000, 50, ${source === "STRAVA" ? "'STRAVA'" : "null"}, ${source === "STRAVA" ? `'strava:${run}'` : "null"}, now())`);
mk(`v22a-own-${run}`, "Fuerza propia E2E", "");
mk(`v22a-str-${run}`, "Importada Strava E2E", "STRAVA");

// --- La entrenadora ve la propia y no la de Strava (lista, detalle y API)
const coa = await newPage();
await login(coa, mail("coa"), pw.coa);
await go(coa, "/coach");
const text = await coa.locator("main").innerText();
if (!text.includes("Fuerza propia E2E")) errors.push("la entrenadora no ve la sesión propia de la atleta");
if (text.includes("Importada Strava E2E")) errors.push("la entrenadora ve una sesión de Strava");
await noHScroll(coa, "/coach 390 px");
await coa.screenshot({ path: `${out}/v22a-01-coach.png`, fullPage: true });
const own = await coa.goto(`${B}/coach/session/v22a-own-${run}?athleteId=${athleteId}`, { waitUntil: "load" });
if (own?.status() !== 200) errors.push(`detalle propio: HTTP ${own?.status()}`);
const str = await coa.goto(`${B}/coach/session/v22a-str-${run}?athleteId=${athleteId}`, { waitUntil: "load" });
if (str?.status() !== 404) errors.push(`detalle de Strava debería dar 404 y da ${str?.status()}`);
const pmc = await call(coa, "GET", `/api/training/pmc?athleteId=${athleteId}&days=30`);
if (!pmc.json?.loadHidden) errors.push("la carga calculada con Strava no se oculta a la entrenadora");
log("la entrenadora no ve Strava (lista, detalle 404 y carga oculta)");

// --- La atleta sí ve las dos
const at = await newPage();
await login(at, mail("at"), pw.at);
await go(at, "/training");
const mine = await at.locator("main").innerText();
if (!mine.includes("Importada Strava E2E")) errors.push("la atleta no ve su propia sesión de Strava");
log("la atleta conserva sus sesiones de Strava");

// --- Métricas en Postgres: al cambiar de minuto la réplica sube lo contado (sin scheduler, que en E2E está apagado)
const before = Number(psql(`select count(*) from "ApiMetricMinute"`));
await call(at, "GET", "/api/training/records");
await at.waitForTimeout(61_000 - (Date.now() % 60_000));
await call(at, "GET", "/api/training/records");
await at.waitForTimeout(1500);
const after = Number(psql(`select count(*) from "ApiMetricMinute"`));
if (after <= before) errors.push(`las métricas no se suben a la BD al cambiar de minuto (${before} → ${after})`);
log("las métricas de administración viven en Postgres");

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v22a");
