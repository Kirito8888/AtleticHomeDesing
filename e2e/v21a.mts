// E2E de la v2.1 bloque 1 (disciplinas: carreras y saltos junto a lanzamientos) en un móvil de 390 px.
//   BASE_URL=http://localhost:3000 npm run e2e:v21a
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import { chromium, type Page } from "playwright-core";

import { a11y } from "./a11y.mjs";

const out = process.env.SHOTS_DIR ?? "e2e/screenshots";
mkdirSync(out, { recursive: true });
const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const newCtx = (ip: string) => browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": ip } });
const watch = (page: Page) => {
  page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/40[0134]|422/.test(m.text())) errors.push(`console ${page.url()}: ${m.text()}`);
  });
  page.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`);
  });
};
const go = async (p: Page, u: string) => {
  await p.goto(B + u, { waitUntil: "load" });
  await p.waitForTimeout(300);
};
const noHScroll = async (p: Page, where: string) => {
  if (await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) errors.push(`scroll horizontal en ${where}`);
};
async function login(page: Page, tag: string) {
  const email = `${tag}-${Date.now()}@e2e.test`;
  const created = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", `Atleta ${tag}`, "--role", "ATHLETE", "--accept-terms"], { encoding: "utf8" });
  const pw = created.match(/Contraseña: (\S+)/)?.[1];
  if (!pw) throw new Error("no se pudo crear el usuario");
  await go(page, "/login");
  await page.fill("#email", email);
  await page.fill("#password", pw);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);
}

// ---------- A. Velocista: 100 m ----------
const ctx = await newCtx("198.51.100.210");
const page = await ctx.newPage();
watch(page);
await login(page, "v21vel");

await go(page, "/settings");
await page.locator("#p-event").selectOption("100m");
await page.getByRole("button", { name: "Guardar perfil" }).click();
await page.getByText("Perfil guardado").first().waitFor();
const prof = await page.evaluate(() => fetch("/api/profile").then((r) => r.json()));
if (prof.athleteProfile?.primaryEvent !== "100m" || prof.athleteProfile?.primaryDiscipline !== "SPRINT") errors.push(`perfil: ${JSON.stringify(prof.athleteProfile)}`);
await noHScroll(page, "ajustes 390 px");
log("especialidad 100 m guardada y disciplina ajustada a Velocidad");

await go(page, "/training/new");
if ((await page.getByRole("tab", { name: "Pista" }).getAttribute("aria-selected")) !== "true") errors.push("la pestaña Pista no abre por defecto para un velocista");
if ((await page.locator("#modality").inputValue()) !== "SPRINT") errors.push("la modalidad no es Velocidad");
await page.getByRole("button", { name: "Añadir serie" }).click();
await page.getByLabel("Distancia serie 1").fill("100");
await page.getByLabel("Tiempo serie 1").fill("11,5");
await page.getByRole("button", { name: "Repetir serie" }).click();
await page.getByLabel("Tiempo serie 2").fill("11,8");
await page.getByText("8,70 m/s").waitFor();
await page.getByTestId("track-summary").getByText("11,50 s").waitFor();
await noHScroll(page, "registro de series 390 px");
errors.push(...(await a11y(page, "/training/new (pista)")));
await page.screenshot({ path: `${out}/v21a-01-series.png`, fullPage: true });
await page.getByRole("button", { name: "Guardar sesión" }).click();
await page.waitForURL(/\/training\/[a-z0-9]+$/);
await page.getByText("8,70 m/s").first().waitFor();
await noHScroll(page, "detalle de pista 390 px");
await page.screenshot({ path: `${out}/v21a-02-detalle.png`, fullPage: true });
log("sesión 2×100 m registrada; el detalle muestra m/s");

await go(page, "/training");
await page.getByText("2×100 m · mejor 11,50 s").first().waitFor();
await page.getByText(/Distancia esta semana/).waitFor();
if (await page.getByText(/Lanzamientos esta semana/).count()) errors.push("un velocista ve la línea de lanzamientos");
if (await page.getByText("Análisis de jabalina").count()) errors.push("un velocista ve el análisis de jabalina");
await noHScroll(page, "lista de entrenamiento 390 px");
await page.screenshot({ path: `${out}/v21a-03-lista.png`, fullPage: true });
await go(page, "/training/diary");
await page.getByText("2×100 m · mejor 11,50 s").first().waitFor();
const day = new Date().toISOString().slice(0, 10);
await go(page, `/planning?month=${day.slice(0, 7)}&day=${day}#dia`);
await page.getByLabel("Sesiones del día").getByText("2×100 m · mejor 11,50 s").waitFor();
await noHScroll(page, "calendario 390 px");
await page.screenshot({ path: `${out}/v21a-04-calendario.png`, fullPage: true });
log("lista, diario y calendario muestran la métrica de la disciplina");

// ---------- B. Saltadora: longitud ----------
await go(page, "/settings");
await page.locator("#p-event").selectOption("longitud");
await page.getByRole("button", { name: "Guardar perfil" }).click();
await page.getByText("Perfil guardado").first().waitFor();
await go(page, "/training/new");
if ((await page.getByRole("tab", { name: "Técnica" }).getAttribute("aria-selected")) !== "true") errors.push("la pestaña Técnica no abre para saltos");
if ((await page.locator("#event").inputValue()) !== "LONG_JUMP") errors.push("la prueba no es Longitud");
log("un saltador abre en Técnica con Longitud");

// ---------- C. Regresión: lanzadora sin cambios ----------
const ctx2 = await newCtx("198.51.100.211");
const p2 = await ctx2.newPage();
watch(p2);
await login(p2, "v21lan");
await go(p2, "/training/new");
if ((await p2.getByRole("tab", { name: "Fuerza" }).getAttribute("aria-selected")) !== "true") errors.push("sin perfil debe abrir en Fuerza como siempre");
const status = await p2.evaluate(async (d) => {
  const r = await fetch("/api/training/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      date: d, type: "TECHNICAL", discipline: "THROWS", durationSec: 3600, sessionRpe: 6,
      technical: { event: "JAVELIN", implementWeightG: 800, attempts: [{ markM: 55.5 }, { markM: 58.25 }] },
    }),
  });
  return r.status;
}, day);
if (status !== 201 && status !== 200) errors.push(`crear sesión de jabalina → ${status}`);
await go(p2, "/training");
await p2.getByText("Jabalina · 58,25 m").first().waitFor();
await p2.getByText(/Lanzamientos esta semana: 2/).waitFor();
await p2.getByText("Análisis de jabalina").waitFor();
await noHScroll(p2, "lista de lanzadora 390 px");
log("lanzamientos intactos: titular, tope semanal y análisis de jabalina");

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v21a");
