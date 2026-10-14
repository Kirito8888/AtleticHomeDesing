// E2E de la v1.10 en un móvil de 390 px (app con ALLOW_REGISTRATION=true y LIFEOS_FAKE_AI=1;
// necesita DATABASE_URL para crear la cuenta con `npm run user`). El OCR necesita tesseract y
// pdftoppm en el servidor (la CI los instala); si faltan, ese paso lo dice y se salta.
//   BASE_URL=http://localhost:3000 npm run e2e:v110
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import { strToU8, zipSync } from "fflate";
import { chromium } from "playwright-core";

import { buildPdf } from "../src/test/pdf-fixture";
import { a11y } from "./a11y.mjs";

const out = process.env.SHOTS_DIR ?? "e2e/screenshots";
mkdirSync(out, { recursive: true });
const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.210" } });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !/40[0134]|422|503/.test(m.text())) errors.push(`console ${page.url()}: ${m.text()}`);
});
page.on("response", (r) => {
  if (r.url().includes("/api/") && r.status() >= 500 && !r.url().includes("/api/ocr/")) errors.push(`HTTP ${r.status()} ${r.url()}`);
});
const go = async (u: string) => {
  await page.goto(B + u, { waitUntil: "load" });
  await page.waitForTimeout(300);
};
const checkA11y = async (where: string) => errors.push(...(await a11y(page, where)));
const shot = (n: string) => page.screenshot({ path: `${out}/v110-${n}.png`, fullPage: true });
const toast = (re: RegExp) => page.getByText(re).first().waitFor({ timeout: 30_000 });
const api = async (method: "post" | "put" | "patch" | "delete", url: string, data?: unknown) => {
  const r = await page.request[method](B + url, data === undefined ? undefined : { data });
  if (!r.ok()) errors.push(`${method.toUpperCase()} ${url}: ${r.status()} ${(await r.text()).slice(0, 160)}`);
  return r.ok() ? r.json().catch(() => ({})) : {};
};
const madrid = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
const run = Date.now();

// 1. Cuenta
const email = `v110${run}@test.dev`;
const pw = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", "Atleta", "--accept-terms"], { encoding: "utf8" }).match(/Contraseña: (\S+)/)?.[1];
if (!pw) throw new Error("no se pudo crear la cuenta");
await go("/login");
await page.fill("#email", email);
await page.fill("#password", pw);
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);
log("cuenta e inicio de sesión");

// 2. Ajustes: Telegram y Strava (sin configurar en este servidor: lo dicen sin romper nada)
await go("/settings#notificaciones");
await page.getByText(/Telegram no está activado|Vincular Telegram/).first().waitFor();
await page.locator("#strava").getByText(/Strava no está activado|Conectar con Strava/).first().waitFor();
await checkA11y("/settings (Telegram y Strava)");
log("Telegram y Strava en Ajustes");

// 3. Alimentos propios, búsqueda local, micronutrientes y foto de la comida (IA simulada)
await go("/nutrition/micros");
await checkA11y("/nutrition/micros");
await page.fill("#of-name", `Arroz blanco cocido V110 ${run}`);
for (const [k, v] of [["kcalPer100g", "130"], ["proteinPer100g", "2,7"], ["carbsPer100g", "28"], ["fatPer100g", "0,3"], ["calciumPer100g", "10"]] as const) await page.fill(`#of-${k}`, v);
await page.getByRole("button", { name: "Guardar alimento" }).click();
await toast(/Alimento guardado/);
await page.getByLabel("Mis alimentos").getByText(`Arroz blanco cocido V110 ${run}`).waitFor();
const found = (await (await page.request.get(`${B}/api/nutrition/search?q=${encodeURIComponent(`arroz blanco V110 ${run}`)}`)).json()) as { source: string; products: Array<{ id: string; name: string }> };
const mine = found.products.find((p) => p.name.includes(`V110 ${run}`));
if (!mine) errors.push(`la búsqueda no encuentra el alimento propio (${found.source})`);
else await api("post", "/api/nutrition/entries", { date: madrid, mealType: "LUNCH", foodProductId: mine.id, quantityG: 200 });
await go("/nutrition/micros");
const calcio = ((await page.locator("div.grid.gap-1").filter({ hasText: /^Calcio/ }).first().textContent()) ?? "").replace(/\s+/g, " ");
if (!/20 \/ 950 mg/.test(calcio)) errors.push(`la media de calcio no refleja la comida anotada: «${calcio}»`);
// Foto: con la IA simulada propone «arroz blanco cocido» y «pechuga de pollo»
await api("put", "/api/account/ai-consent", { enabled: true });
await go("/nutrition");
const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAA//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AN//Z", "base64");
await page.getByLabel("Anotar desde una foto (IA)").setInputFiles({ name: "plato.jpg", mimeType: "image/jpeg", buffer: jpeg });
const photo = page.getByRole("group", { name: "Alimentos de la foto" });
await photo.waitFor({ timeout: 30_000 });
await checkA11y("/nutrition (foto)");
await photo.getByRole("button", { name: /^Descartar$/ }).click();
await shot("01-nutricion");
log("alimento propio, búsqueda local, micronutrientes y foto de la comida");

// 4. Plan de comidas con IA (simulada): 3 recetas → propuesta → aceptar dos días
const item = (name: string, kcal100: number) => ({ name, grams: 300, kcal100, protein100: 8, carbs100: 20, fat100: 4 });
for (const [n, k] of [["Lentejas V110", 120], ["Pasta con atún V110", 180], ["Pollo al horno V110", 150]] as const) await api("post", "/api/nutrition/recipes", { name: n, servings: 2, items: [item(n, k)] });
await go("/nutrition/plan");
await page.getByRole("button", { name: "Proponer la semana con IA" }).click();
const plan = page.getByRole("group", { name: "Propuesta de la semana" });
await plan.waitFor({ timeout: 30_000 });
const days = plan.getByRole("checkbox");
for (let i = 2; i < (await days.count()); i++) await days.nth(i).uncheck();
await plan.getByRole("button", { name: /Añadir 2 días/ }).click();
await toast(/comidas añadidas al plan/);
await checkA11y("/nutrition/plan");
log("plan de comidas propuesto por la IA y aceptado por días");

// 5. Horario de la universidad (.ics) y calendario de la federación (Excel)
await go("/study/schedule");
await page.getByText("Importar el horario de la universidad (.ics)").click();
const ics = ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "SUMMARY:Bioquímica V110", "DTSTART;TZID=Europe/Madrid:20260914T090000", "DTEND;TZID=Europe/Madrid:20260914T110000", "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261218T235959Z", "END:VEVENT", "BEGIN:VEVENT", "SUMMARY:Examen final Bioquímica V110", "DTSTART:20270115T080000Z", "DTEND:20270115T100000Z", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
await page.getByLabel("Horario de la universidad (.ics)").setInputFiles({ name: "horario.ics", mimeType: "text/calendar", buffer: Buffer.from(ics) });
await page.getByRole("button", { name: "Añadir 3 al horario" }).click();
await toast(/3 añadidos/);
await checkA11y("/study/schedule (importar)");
const xlsx = zipSync({
  "xl/sharedStrings.xml": strToU8("<sst><si><t>Fecha</t></si><si><t>Competición</t></si><si><t>Sede</t></si><si><t>Control de lanzamientos V110</t></si><si><t>Castellón</t></si></sst>"),
  "xl/worksheets/sheet1.xml": strToU8(`<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>${madrid.split("-").reverse().join("/")}</t></is></c><c r="B2" t="s"><v>3</v></c><c r="C2" t="s"><v>4</v></c></row></sheetData></worksheet>`),
});
await go("/planning#competiciones");
await page.getByText(/^Importar calendario de competiciones/).click();
await page.getByLabel(/^Calendario de competiciones/).setInputFiles({ name: "federacion.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(xlsx) });
await page.getByLabel("Competiciones encontradas").getByText(/Control de lanzamientos V110 · Castellón/).waitFor();
await page.getByRole("button", { name: /Añadir 1 al calendario/ }).click();
await toast(/1 competiciones añadidas/);
log("horario de la universidad (.ics) y calendario de la federación (Excel)");

// 6. Suplementos: aviso antidopaje con las fuentes oficiales
await go("/recovery/health");
const note = page.getByRole("note", { name: "Aviso antidopaje" });
await note.waitFor();
if (!(await note.getByRole("link", { name: "Lista de Prohibiciones de la AMA" }).getAttribute("href"))?.startsWith("https://www.wada-ama.org/")) errors.push("enlace a la AMA");
log("aviso antidopaje en suplementos");

// 7. OCR de un ticket en el servidor (si tiene tesseract)
await api("post", "/api/finance/accounts", { name: "Banco V110", type: "ASSET" });
await go("/finance");
await page.getByRole("button", { name: "Movimiento" }).click();
const ticket = buildPdf([[{ x: 60, y: 80, size: 22, text: "DEPORTES V110" }, { x: 60, y: 120, size: 18, text: "Fecha 03/10/2026" }, { x: 60, y: 160, size: 22, text: "TOTAL 27,90" }]]);
const ocr = page.waitForResponse((r) => r.url().includes("/api/ocr/receipt"));
const createAccount = page.getByText(/Crea primero una cuenta/);
if (await createAccount.count()) {
  log("OCR: sin cuentas de finanzas, se salta");
} else {
  await page.getByLabel("Rellenar desde un ticket").setInputFiles({ name: "ticket.pdf", mimeType: "application/pdf", buffer: Buffer.from(ticket) });
  const r = await ocr;
  if (r.status() === 503) log("OCR no disponible en este servidor: se salta");
  else {
    await page.waitForFunction(() => (document.querySelector("#t-amount") as HTMLInputElement | null)?.value === "27,90", null, { timeout: 30_000 }).catch(() => errors.push("el OCR no rellenó el importe del ticket"));
    log("ticket leído con OCR en el servidor");
  }
}

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v110");
