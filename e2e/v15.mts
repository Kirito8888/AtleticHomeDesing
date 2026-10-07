// E2E de la v1.5 en un móvil de 390 px (app con ALLOW_REGISTRATION=true y LIFEOS_FAKE_AI=1).
//   BASE_URL=http://localhost:3000 npm run e2e:v15
import { mkdirSync } from "node:fs";

import { chromium } from "playwright-core";

const out = process.env.SHOTS_DIR ?? "e2e/screenshots";
mkdirSync(out, { recursive: true });
const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !/404|422/.test(m.text())) errors.push(`console ${page.url()}: ${m.text()}`);
});
page.on("response", (r) => {
  if (r.url().includes("/api/") && r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`);
});
const shot = (n: string) => page.screenshot({ path: `${out}/v15-${n}.png`, fullPage: true });
const go = async (u: string) => {
  await page.goto(u, { waitUntil: "load" });
  await page.waitForTimeout(400);
};
const toast = (re: RegExp) => page.getByText(re).first().waitFor({ timeout: 30_000 });
const noOverflow = async (where: string) => {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  if (w > 392) errors.push(`${where}: desborda en horizontal (${w}px)`);
};
const radio = (group: string, name: string | RegExp) => page.getByRole("radiogroup", { name: group }).getByRole("radio", { name, exact: typeof name === "string" });
const madrid = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
const plusDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const api = async (method: "post" | "put" | "patch" | "delete", url: string, data?: unknown) => {
  const r = await page.request[method](B + url, data === undefined ? undefined : { data });
  if (!r.ok()) errors.push(`${method.toUpperCase()} ${url}: ${r.status()} ${(await r.text()).slice(0, 160)}`);
  return r.ok() ? r.json().catch(() => ({})) : {};
};

// 1. Registro con perfil de mujer
await go(B + "/register");
await page.fill("#name", "Atleta Prueba");
await page.fill("#email", `v15${Date.now()}@test.dev`);
await page.fill("#password", "contraseña-segura-1");
await Promise.all([page.waitForURL(/\/settings\?welcome=1/), page.click("button[type=submit]")]);
await page.selectOption("#p-sex", "FEMALE");
await page.getByRole("button", { name: "Guardar perfil" }).click();
await toast(/Perfil guardado/);
log("registro y perfil");

// 2. Bloque M: salud de la mujer
// Ciclo: regla hace 1 día y se encuentra peor durante la regla; test de RM mañana → sugerencia de moverlo
await api("put", "/api/health/cycle", { avgLength: 28, periodDays: 5, lastStart: plusDays(madrid, -1), hormonal: "no", symptoms: ["dolor"], symptomParts: ["regla"] });
await api("post", "/api/training/sessions", { date: plusDays(madrid, 1), type: "STRENGTH", status: "PLANNED", title: "Fuerza · SERIE DE TEST", strength: { sets: [] } });
await go(B + "/recovery");
await page.getByRole("link", { name: "Salud de la mujer" }).click();
await page.waitForURL(/\/recovery\/women$/);
const health = page.getByLabel("Avisos de salud");
await health.getByText("«Fuerza · SERIE DE TEST» cae en un día con síntomas previstos").waitFor();
await health.getByText("Toca el cribado de RED-S").waitFor();

// Cribado: una respuesta roja → valoración médica
for (const q of await page.getByRole("radiogroup").all()) {
  const name = (await q.getAttribute("aria-label")) ?? "";
  if (!name.startsWith("¿")) continue;
  await q.getByRole("radio", { name: /fractura por estrés/.test(name) ? "Sí" : "No", exact: true }).click();
}
await page.getByRole("button", { name: "Guardar el cribado" }).click();
await toast(/Cribado guardado/);
await health.getByText("Cribado de RED-S: señal de alarma").waitFor();

// Analítica con ferritina baja
await page.getByRole("textbox", { name: "Ferritina", exact: true }).fill("18");
await page.getByRole("button", { name: "Guardar analítica" }).click();
await toast(/Analítica guardada/);
await health.getByText(/Ferritina 18 µg\/L/).waitFor();

// Suelo pélvico
await page.getByRole("group", { name: "Síntomas de suelo pélvico" }).getByRole("checkbox", { name: "Pérdidas de orina al saltar" }).click();
await page.getByRole("button", { name: "Anotar hoy" }).click();
await toast(/Anotado/);
await health.getByText("Síntomas de suelo pélvico esta semana").waitFor();
await shot("01-women");
await noOverflow("salud de la mujer");

// Inicio muestra los avisos fuertes; el calendario, los días previstos
await go(B + "/");
await page.getByLabel("Avisos de salud").getByText(/Ferritina 18/).waitFor();
await go(`${B}/planning?month=${madrid.slice(0, 7)}`);
if (!(await page.getByTitle(/Regla prevista|Síntomas previstos/).count())) errors.push("calendario: no marca los días previstos del ciclo");

// Modo posparto: fases y bloqueo de la IA
await go(B + "/recovery/women");
await radio("Modo", "Posparto").click();
await page.fill("#pp-date", plusDays(madrid, -50));
await page.getByRole("button", { name: "Guardar ajustes" }).click();
await toast(/Ajustes guardados/);
await page.getByText(/Vuelta posparto · semana 7/).waitFor();
await page.getByLabel("Criterios para pasar de fase").getByText(/Tengo el alta/).click();
await toast(/Guardado/);
await page.getByLabel("Fases posparto").getByText("▶ 6–12 semanas: fuerza de base sin impacto").waitFor();
await shot("02-postpartum");
await go(B + "/study/plan");
await page.getByText(/Tienes activo el modo posparto/).waitFor();
log("salud de la mujer: cribado, ferritina, suelo pélvico, ciclo en el plan y posparto");

// El informe compartido y el .ics no llevan nada de esto
await go(B + "/settings#informe");
await page.getByRole("button", { name: "Crear enlace del informe" }).click();
const reportUrl = (await page.getByRole("textbox", { name: "Enlace del informe" }).inputValue()).replace(/^https?:\/\/[^/]+/, B);
const report = await (await page.request.get(reportUrl)).text();
if (/ferritina|suelo pélvico|posparto|RED-S|regla/i.test(report)) errors.push("informe: contiene datos de salud de la mujer");
log("el informe compartido no lleva datos de salud de la mujer");

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v15");
