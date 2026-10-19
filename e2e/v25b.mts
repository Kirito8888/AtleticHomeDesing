// E2E del bloque «prescripción científica con citas» en un móvil de 390 px (app con ALLOW_REGISTRATION=true; necesita DATABASE_URL).
//   BASE_URL=http://localhost:3000 npm run e2e:v25b
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import { chromium } from "playwright-core";

const out = process.env.SHOTS_DIR ?? "e2e/screenshots";
mkdirSync(out, { recursive: true });
const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.173" } });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
page.on("response", (r) => {
  if (r.url().includes("/api/") && r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`);
});
const noOverflow = async (where: string) => {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  if (w > 392) errors.push(`${where}: desborda en horizontal (${w}px)`);
};
const radio = (group: string, name: string) => page.getByRole("radiogroup", { name: group }).getByRole("radio", { name, exact: true });
const check = (group: string, name: string) => page.getByRole("group", { name: group }).getByRole("checkbox", { name, exact: true });

const email = `v25b${Date.now()}@test.dev`;
const out1 = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", "Amiga", "--role", "ATHLETE", "--accept-terms"], { encoding: "utf8" });
const pw = out1.match(/Contraseña: (\S+)/)?.[1];
if (!pw) throw new Error("no se pudo crear la cuenta");
await page.goto(B + "/login");
await page.fill("#email", email);
await page.fill("#password", pw);
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);

await page.goto(B + "/training/routine");
await radio("Soy", "Mujer").click();
await page.getByLabel("Edad").fill("29");
await radio("Experiencia entrenando", "Nunca he entrenado con regularidad").click();
await radio("Actividad diaria", "Ligera (camino a diario)").click();
await page.getByRole("button", { name: "Siguiente" }).click();
await page.getByRole("button", { name: "No me pasa nada de esto" }).click();
await page.getByRole("button", { name: "Siguiente" }).click();
await page.getByRole("button", { name: "Siguiente" }).click();
await radio("Objetivo a corto plazo", "Ganar fuerza").click();
await radio("Objetivo a largo plazo", "Hacer del ejercicio un hábito").click();
await page.getByRole("button", { name: "Siguiente" }).click();

for (const d of ["Lun", "Mié", "Vie"]) await check("Días por semana", d).click();
// varios espacios a la vez: pista + gimnasio; los chips miden ≥ 44 px
for (const l of ["Gimnasio"]) {
  const chip = check("Dónde entrenas", l);
  await chip.click();
  const h = (await chip.boundingBox())!.height;
  if (h < 44) errors.push(`el chip «${l}» mide ${h}px (< 44)`);
}
if ((await check("Dónde entrenas", "Gimnasio").getAttribute("aria-checked")) !== "true") errors.push("el gimnasio no queda marcado");
await page.getByRole("button", { name: "Crear mi rutina" }).click();
await page.waitForURL(/\/training\/routine\/[a-z0-9]+$/, { timeout: 30_000 });
await page.getByRole("link", { name: "Ver y activar la rutina" }).click();
await page.getByText("Es un borrador").waitFor();
const mesoUrl = page.url();

// la introducción lista las referencias con DOI
await page.locator("summary", { hasText: "Referencias" }).click();
await page.getByText(/doi:10\.\d+\//).first().waitFor();
await noOverflow("/planning/meso (referencias)");

// un día: series, descanso y repeticiones justificados, con citas plegables
await page.getByRole("link", { name: /Fuerza A/ }).first().click();
await page.getByText("Plan del día").waitFor();
const why = page.locator("summary", { hasText: "Por qué estas series" }).first();
const h = (await why.boundingBox())!.height;
if (h < 44) errors.push(`el desplegable de la justificación mide ${h}px (< 44)`);
await why.click();
await page.getByText(/series semanales por grupo muscular/).first().waitFor();
const link = page.locator('a[href^="https://doi.org/10."]').first();
await link.waitFor();
const lh = (await link.boundingBox())!.height;
if (lh < 44) errors.push(`el enlace al DOI mide ${lh}px (< 44)`);
if ((await link.getAttribute("rel")) !== "noopener noreferrer") errors.push("el enlace al DOI no lleva rel=noopener noreferrer");
if (!(await page.getByText("RIR").count())) errors.push("no se ve el RIR");
await noOverflow("/planning/plan/[id] (justificación)");
await page.screenshot({ path: `${out}/v25b-day.png`, fullPage: true });
log("día con series, descanso y repeticiones justificados y citas con DOI");

// editar el día del borrador: cambia las series y la cita se conserva
await page.getByRole("link", { name: "Editar este día" }).click();
const sets = page.getByLabel("Series 1", { exact: true });
await sets.fill("5 × 5");
await noOverflow("/planning/plan/[id]/edit");
await page.getByRole("button", { name: "Guardar día" }).click();
await page.waitForURL(/\/planning\/meso\//);
await page.getByRole("link", { name: /Fuerza A/ }).first().click();
await page.getByText("5 × 5").first().waitFor();
await page.locator("summary", { hasText: "Por qué estas series" }).first().click();
await page.locator('a[href^="https://doi.org/10."]').first().waitFor();
log("edición del borrador conservando justificación y citas");

// solo se activa con confirmación
await page.goto(mesoUrl);
await page.getByRole("button", { name: "Activar en mis entrenamientos" }).click();
await page.getByText("Plan activo en tus entrenamientos.").waitFor({ timeout: 30_000 });
log("activación tras confirmar");

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v25b");
