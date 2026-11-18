// E2E de «Nutrición · macros por tipo de sesión y día de la semana» en un móvil de 390 px (necesita build de producción y DATABASE_URL).
//   BASE_URL=http://localhost:3000 npm run e2e:macros
import { execFileSync } from "node:child_process";

import { chromium } from "playwright-core";

const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.181" } });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
const noOverflow = async (where: string) => {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  if (w > 392) errors.push(`${where}: desborda en horizontal (${w}px)`);
};
const minH = async (loc: ReturnType<typeof page.locator>, what: string) => {
  const h = (await loc.first().boundingBox())?.height ?? 0;
  if (h < 43.5) errors.push(`${what} mide ${h}px (< 44)`);
};
const toast = (re: RegExp) => page.locator("[data-sonner-toast]", { hasText: re }).first().waitFor({ timeout: 8000 });
let rscCount = 0;
page.on("request", (r) => {
  if (r.headers()["rsc"] === "1") rscCount++;
});

const email = `macros${Date.now()}@test.dev`;
const out = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", "Atleta", "--role", "ATHLETE", "--accept-terms"], { encoding: "utf8" });
const pw = out.match(/Contraseña: (\S+)/)?.[1];
if (!pw) throw new Error("no se pudo crear la cuenta");
await page.goto(B + "/login");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(6000);
await page.fill("#email", email);
await page.fill("#password", pw);
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);

// Objetivo base y un día de la semana fijo para la prueba: mañana (sin sesiones; no depende del día real)
const DAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const madrid = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Madrid" }));
const tomorrow = new Date(madrid.getFullYear(), madrid.getMonth(), madrid.getDate() + 1, 12);
const iso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
const wd = (tomorrow.getDay() + 6) % 7; // 0 = lunes
const dayName = DAYS[wd];
const status = await page.evaluate(async () => {
  const r = await fetch("/api/nutrition/goals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ effectiveFrom: "2020-01-01", kcal: 2400, proteinG: 120, carbsG: 300, fatG: 70 }) });
  return r.status;
});
if (status !== 201) errors.push(`objetivo base no creado (${status})`);

// 1 · Ajustes: regla del día de la semana (+50 g de hidratos → +200 kcal)
await page.goto(B + "/settings");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(1500);
const row = page.locator("details", { has: page.locator("summary", { hasText: new RegExp(`^\\s*${dayName}`, "i") }) }).first();
await row.locator("summary").scrollIntoViewIfNeeded();
await row.locator("summary").click();
await minH(row.locator("summary"), `fila de ${dayName}`);
await row.getByLabel(new RegExp(`^Hidratos · ${dayName}`, "i")).fill("50");
await noOverflow("ajustes · reglas de macros");
await page.getByRole("button", { name: "Guardar reglas de macros" }).click();
await toast(/Reglas de macros guardadas/);
log(`regla del ${dayName} guardada desde Ajustes (+50 g de hidratos)`);

// 2 · /nutrition ese día: objetivo adaptado y etiqueta
await page.goto(`${B}/nutrition?date=${iso}`);
await page.waitForLoadState("networkidle");
await page.getByTestId("day-target-source").getByText(`Objetivo del ${dayName}`).waitFor();
await page.getByText(/\/ 350 g/).first().waitFor();
await page.getByText(/\/ 2600 kcal/).first().waitFor();
await noOverflow("/nutrition con objetivo adaptado");
log("«/nutrition» muestra el objetivo del día adaptado: 2600 kcal · 350 g de hidratos");

// 3 · Objetivo manual: prevalece y se quita sin repintar la página entera
const edit = page.getByTestId("day-target-edit");
await minH(edit, "«Ajustar objetivo de este día»");
await edit.click();
await page.getByRole("textbox", { name: "Energía", exact: true }).fill("1900");
await page.getByRole("textbox", { name: "Hidratos", exact: true }).fill("200");
await noOverflow("hoja de objetivo del día");
rscCount = 0;
await page.getByTestId("day-target-save").click();
await toast(/Objetivo del día guardado/);
await page.getByTestId("day-target-source").getByText("Objetivo marcado a mano").waitFor();
await page.getByText(/\/ 1900 kcal/).first().waitFor();
await page.getByText(/\/ 200 g/).first().waitFor();
if (rscCount) errors.push(`marcar objetivo repintó la página entera (${rscCount} peticiones RSC)`);
log("objetivo manual 1900 kcal · 200 g prevalece sobre la regla (0 RSC)");

rscCount = 0;
await minH(page.getByTestId("day-target-reset"), "«Volver al automático»");
await page.getByTestId("day-target-reset").click();
await toast(/Vuelve el objetivo automático/);
await page.getByTestId("day-target-source").getByText(`Objetivo del ${dayName}`).waitFor();
await page.getByText(/\/ 2600 kcal/).first().waitFor();
if (rscCount) errors.push(`volver al automático repintó la página entera (${rscCount} peticiones RSC)`);
log("«Volver al automático» recupera la regla del día (0 RSC)");

// 4 · Un día de otra semana del día sin regla cae al objetivo general
const other = new Date(tomorrow.getTime() + 86400000);
const isoOther = `${other.getFullYear()}-${String(other.getMonth() + 1).padStart(2, "0")}-${String(other.getDate()).padStart(2, "0")}`;
await page.goto(`${B}/nutrition?date=${isoOther}`);
await page.waitForLoadState("networkidle");
await page.getByText(/\/ 2400 kcal/).first().waitFor();
log("un día sin regla usa el objetivo general (2400 kcal)");

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK macros");
