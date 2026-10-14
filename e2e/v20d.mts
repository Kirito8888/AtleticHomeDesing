// E2E de la v2.0 bloque D (semanas «VFC» del PDF y tendencias de meses) en un móvil de 390 px.
//   BASE_URL=http://localhost:3000 npm run e2e:v20d
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import { zipSync } from "fflate";
import { chromium, type Page } from "playwright-core";

import { mesoPdf } from "../src/test/plan-fixtures";
import { a11y } from "./a11y.mjs";

const out = process.env.SHOTS_DIR ?? "e2e/screenshots";
mkdirSync(out, { recursive: true });
const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.180" } });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !/40[0134]|422/.test(m.text())) errors.push(`console ${page.url()}: ${m.text()}`);
});
page.on("response", (r) => {
  if (r.url().includes("/api/") && r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`);
});
const go = async (p: Page, u: string) => {
  await p.goto(B + u, { waitUntil: "load" });
  await p.waitForTimeout(300);
};
const noHScroll = async (where: string) => {
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) errors.push(`scroll horizontal en ${where}`);
};

const run = Date.now();
const email = `vfc-${run}@e2e.test`;
const created = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", "Atleta VFC", "--role", "ATHLETE", "--accept-terms"], { encoding: "utf8" });
const pw = created.match(/Contraseña: (\S+)/)?.[1];
if (!pw) throw new Error("no se pudo crear el usuario");
await go(page, "/login");
await page.fill("#email", email);
await page.fill("#password", pw);
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);

// 1. Importar un plan con una semana marcada «VFC» (semana 2: 02/11 – 08/11)
const zip = Buffer.from(zipSync({ "Plan/M5_dia_a_dia.pdf": mesoPdf() }));
await go(page, "/planning");
await page.getByRole("button", { name: "Importar plan" }).click();
await page.locator("#plan-file").setInputFiles({ name: "plan.zip", mimeType: "application/zip", buffer: zip });
const preview = page.getByLabel("Vista previa del plan");
await preview.waitFor({ timeout: 60_000 });
await preview.getByRole("button", { name: /^Importar \d+ días$/ }).click();
await page.getByText(/Plan importado/).first().waitFor({ timeout: 120_000 });
log("plan con semana VFC importado");

// 2. El calendario la identifica (solo en esa semana) y el bloque la muestra
await go(page, "/planning?month=2026-11&day=2026-11-03#dia");
const marks = await page.getByTitle("Semana de VFC: mide la VFC cada mañana").count();
if (marks !== 7) errors.push(`el calendario marca ${marks} días «VFC» y debería marcar 7`);
await noHScroll("calendario con semana VFC 390 px");
await page.screenshot({ path: `${out}/v20d-01-calendario.png`, fullPage: true });
await go(page, "/planning/meso/M5");
await page.getByText("VFC", { exact: true }).first().waitFor();
await noHScroll("bloque con semana VFC 390 px");
log("la semana VFC se ve en el calendario y en el bloque");

// 3. Tendencias: 4 meses de base estable y un mes reciente con peor sueño y VFC
const post = (date: string, sleepHours: number, hrvRmssdMs: number | null) =>
  page.evaluate(
    async ([d, s, h]) => {
      const r = await fetch("/api/recovery", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ date: d, sleepHours: s, ...(h ? { hrvRmssdMs: h } : {}) }) });
      return r.status;
    },
    [date, sleepHours, hrvRmssdMs] as const,
  );
const seed: number[] = [];
for (const m of ["2026-06", "2026-07", "2026-08", "2026-09"]) for (let d = 1; d <= 8; d++) seed.push(await post(`${m}-0${d}`, 8, d <= 4 ? 100 : null));
for (let d = 1; d <= 8; d++) seed.push(await post(`2026-10-0${d}`, 6.8, d <= 4 ? 85 : null));
if (seed.some((x) => x !== 200)) errors.push(`no se pudieron sembrar las lecturas: ${seed.filter((x) => x !== 200).join(",")}`);
await go(page, "/recovery/trends");
await page.getByText("Varias señales de fatiga acumulada a la vez").waitFor();
await page.locator("[data-slot=card-title]", { hasText: /Duermes 1,2 h menos/ }).waitFor();
await page.locator("[data-slot=card-title]", { hasText: "VFC −15 % frente a los meses anteriores" }).waitFor();
for (const sm of await page.getByText("Por qué").all()) await sm.click();
await page.getByText(/Umbral de «Mis reglas»/).first().waitFor();
await page.getByText("Umbral de «Mis reglas»: Bajada de sueño ≥ 0,5 h.").waitFor();
await page.getByText(/es 6,8 h frente a 8 h/).waitFor();
await noHScroll("tendencias 390 px");
errors.push(...(await a11y(page, "/recovery/trends")));
await page.screenshot({ path: `${out}/v20d-02-tendencias.png`, fullPage: true });
const api = await page.evaluate(() => fetch("/api/recovery/trends").then(async (r) => ({ status: r.status, json: await r.json() })));
if (api.status !== 200 || !api.json.alerts?.length) errors.push(`/api/recovery/trends → ${api.status}`);
log("alerta multimes con su explicación");

// 4. Sin sesión, la API no responde con datos
const anon = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.181" } });
const r = await anon.request.get(`${B}/api/recovery/trends`);
if (r.status() !== 401) errors.push(`API de tendencias sin sesión → ${r.status()} (esperaba 401)`);
log("API protegida");

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v20d");
