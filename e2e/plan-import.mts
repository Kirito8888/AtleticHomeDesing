// E2E: importar la planificación desde la app en un móvil de 390 px.
// Registra un usuario, sube un zip con PDF «día a día» SINTÉTICOS (generados
// aquí, sin datos reales), revisa la vista previa, importa, cambia de versión y
// abre el plan del día. Uso (app arrancada con ALLOW_REGISTRATION=true):
//   BASE_URL=http://localhost:3000 npm run e2e:plan
// Variables: BASE_URL, CHROMIUM_PATH, SHOTS_DIR, PLAN_ZIP (opcional: probar con
// tu propio zip en local; nunca lo subas al repositorio).
import { mkdirSync, readFileSync } from "node:fs";

import { zipSync } from "fflate";
import { chromium } from "playwright-core";

import { mesoPdf, versionsPdf } from "../src/test/plan-fixtures";

const out = process.env.SHOTS_DIR ?? "e2e/screenshots";
mkdirSync(out, { recursive: true });
const B = process.env.BASE_URL ?? "http://localhost:3000";
const realZip = process.env.PLAN_ZIP;
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !/404/.test(m.text())) errors.push(`console ${page.url()}: ${m.text()}`);
});
page.on("response", (r) => {
  if (r.url().includes("/api/") && r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`);
});
const shot = (n: string) => page.screenshot({ path: `${out}/plan-${n}.png`, fullPage: true });
const go = async (u: string) => {
  await page.goto(u, { waitUntil: "load" });
  await page.waitForTimeout(500);
};
const noOverflow = async (where: string) => {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  if (w > 392) errors.push(`${where}: desborda en horizontal (${w}px)`);
};

// 1. Registro
await go(B + "/register");
await page.fill("#name", "Atleta Prueba");
await page.fill("#email", `plan${Date.now()}@test.dev`);
await page.fill("#password", "contraseña-segura-1");
await Promise.all([page.waitForURL(/\/settings\?welcome=1/), page.click("button[type=submit]")]);
log("registro");

// 2. Subir el plan y revisar la vista previa
const zip = realZip ? readFileSync(realZip) : Buffer.from(zipSync({ "Plan/M5_dia_a_dia.pdf": mesoPdf(), "Plan/M9_dia_a_dia.pdf": versionsPdf() }));
await go(B + "/planning");
await page.getByRole("button", { name: "Importar plan" }).click();
await page.locator("#plan-file").setInputFiles({ name: "plan.zip", mimeType: "application/zip", buffer: zip });
const preview = page.getByLabel("Vista previa del plan");
await preview.waitFor({ timeout: 60_000 });
const summary = await preview.locator("p").first().innerText();
log("vista previa:", summary);
if (!realZip && !/9 días en 2 bloques/.test(summary)) errors.push(`vista previa inesperada: ${summary}`);
await shot("01-preview");

// 3. Importar
const importBtn = preview.getByRole("button", { name: /^Importar \d+ días$/ });
await importBtn.click();
await page.getByText(/Plan importado/).first().waitFor({ timeout: 120_000 });
log("importado:", await page.getByText(/Plan importado/).first().innerText());
await page.waitForTimeout(800);

// 4. Versiones: B activa por defecto; pasar a «A · viernes» y volver a B
const versions = page.locator("#plan");
await versions.waitFor();
if (!realZip) {
  const m9 = versions.getByRole("group", { name: /M9/ });
  if (!(await m9.getByText("(activa)").locator("..").innerText()).includes("Versión B")) errors.push("la versión B no es la activa por defecto");
  await m9.getByRole("radio", { name: /Variante 1/ }).check();
  await m9.getByRole("button", { name: "Usar esta versión" }).click();
  await page.getByText(/M9: Versión A · Variante 1/).first().waitFor({ timeout: 30_000 });
  log("versión A (viernes) activada");
  await page.waitForTimeout(800);
}
await versions.scrollIntoViewIfNeeded();
await shot("02-versions");
await noOverflow("planificación");

// 5. Abrir el día desde el calendario y ver el plan en el móvil
const firstDay = realZip ? "2026-09-28" : "2026-10-26";
await go(`${B}/planning?month=${firstDay.slice(0, 7)}&day=${firstDay}#dia`);
await page.getByRole("list", { name: "Sesiones del día" }).getByRole("link").first().click();
await page.waitForURL(/\/training\/c/);
await page.getByText("Plan del día").waitFor();
const exercises = page.getByRole("list", { name: "Ejercicios" }).first();
await exercises.waitFor();
if (!realZip) {
  await page.getByText("Snatch colgante").waitFor();
  const card = page.getByRole("listitem").filter({ hasText: "Lanzamientos con jabalina 700 g" });
  await card.getByText("Cómo lo hago").click();
  await card.getByText("Foco: un solo punto técnico en cada intento").waitFor();
  await page.getByText("Por qué").click();
  await page.getByText("apartado de explicación").waitFor();
}
await shot("03-day");
await noOverflow("plan del día");
log("plan del día legible en 390 px");

// 6. Un día de otra versión (no activa) se puede consultar
if (!realZip) {
  await go(B + "/planning");
  const m9 = page.locator("#plan").getByRole("group", { name: /M9/ });
  await m9.getByText(/Ver sus \d+ días/).last().click();
  await m9.getByRole("link").last().click();
  await page.waitForURL(/\/planning\/plan\//);
  await page.getByText("Plan del día").waitFor();
  log("día de otra versión:", await page.locator("h1").innerText());
}

// 7. Página del bloque: introducción, semanas y anexos (tabla de RM)
await go(`${B}/planning/meso/M5`);
await page.getByRole("heading", { name: /^M5 · / }).waitFor();
await page.getByLabel("Anexos").getByText(/Anexo B/).waitFor();
await page.getByText("Semanas y días").waitFor();
await shot("04-meso");
await noOverflow("página del bloque");
log("página del bloque con anexos");

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK plan-import");
