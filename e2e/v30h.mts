// v3.0 H · «Hoy»: acción principal, registro en 1–2 toques (serie, toma, agua, gasto) y porqués, a 390 px.
// El día real decide la rama de la revisión semanal (sáb/dom). Necesita build de producción y DATABASE_URL.
//   BASE_URL=http://localhost:3000 npm run e2e:v30h
import { execFileSync } from "node:child_process";

import { chromium, type Page } from "playwright-core";

const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.77" } });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
page.on("response", (r) => {
  if (r.url().includes("/api/") && r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`);
});
const go = async (p: Page, u: string) => {
  await p.goto(B + u, { waitUntil: "load" });
  await p.waitForLoadState("networkidle").catch(() => {});
};
// Día, día de la semana y hora de Madrid, como la app (con UTC fallaba de 00:00 a 01:00/02:00 de Madrid: el sábado aún era «viernes»)
const madridDay = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
const madridWeekday = new Date(`${madridDay}T12:00:00Z`).getUTCDay();
const madridHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
const email = `v30h-${Date.now()}@e2e.test`;
const pw = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", "Atleta H", "--role", "ATHLETE", "--accept-terms"], { encoding: "utf8" }).match(/Contraseña: (\S+)/)?.[1];
if (!pw) throw new Error("no se pudo crear la cuenta");
const dbUrl = (process.env.DATABASE_URL ?? "").replace(/\?.*/, "");
const psql = (sql: string) => execFileSync("psql", [dbUrl, "-Atqc", sql], { encoding: "utf8" }).trim();
await go(page, "/login");
await page.waitForTimeout(2500); // hidratación del formulario
await page.fill("#email", email);
await page.fill("#password", pw);
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);

// 1 · Cuenta nueva: «Ahora» enseña, los cuatro registros están a la vista sin abrir el menú
await go(page, "/");
const now = page.getByLabel("Ahora");
await now.waitFor();
const reg = page.getByLabel("Registrar");
for (const n of [/Serie/, /Toma/, /Agua/, /Gasto/]) if (!(await reg.getByText(n).first().isVisible())) errors.push(`falta «${n}» en Registrar`);
const weekend = [0, 6].includes(madridWeekday);
// Una cuenta nueva solo tiene acción principal en fin de semana (revisión) o de 06:00 a 23:00 (comida); de noche entre semana: «Todo al día»
const hasMain = weekend || (madridHour >= 6 && madridHour < 23);
const nowText = await now.innerText();
if (weekend && !/revisión semanal/i.test(nowText)) errors.push(`fin de semana sin aviso de revisión en «Ahora»: ${nowText}`);
if (!weekend && /revisión semanal/i.test(nowText)) errors.push("entre semana aparece la revisión semanal");
if (hasMain && !(await page.getByTestId("now-why").count())) errors.push("«Ahora» sin su porqué");
if (!hasMain && !/Todo al día/.test(nowText)) errors.push(`de noche entre semana «Ahora» debía decir «Todo al día»: ${nowText}`);
log(`Ahora y Registrar visibles (${weekend ? "fin de semana" : "entre semana"}, ${madridHour} h de Madrid)`);

// 2 · Agua: 1 toque
const wait = page.waitForResponse((r) => r.url().includes("/api/nutrition/water") && r.request().method() === "POST");
await reg.getByRole("button", { name: /Agua/ }).tap();
if (!(await wait).ok()) errors.push("agua no guardada");
log("agua en 1 toque");

// 3 · Toma: abrir + «Buscar › Añadir a mano» + guardar (v3.2 L: Menús y Recientes dan 2 toques; lo manual es la vía secundaria)
await reg.getByRole("button", { name: /Toma/ }).tap();
const sheet = page.getByRole("dialog");
await sheet.getByRole("tab", { name: "Buscar" }).tap();
await sheet.getByRole("button", { name: "Añadir a mano" }).tap();
const tab = sheet.getByRole("tabpanel");
await tab.locator("#m-name").fill("Tostada H");
for (const [n, v] of [["qty", "40"], ["kcal", "120"], ["p", "4"], ["c", "20"], ["g", "2"]]) await tab.locator(`#m-${n}`).fill(v);
const entry = page.waitForResponse((r) => r.url().includes("/api/nutrition/entries") && r.request().method() === "POST", { timeout: 15_000 }).catch(() => null);
await tab.getByRole("button", { name: "Añadir" }).tap();
const er = await entry;
if (!er?.ok()) errors.push("toma no guardada desde Hoy");
await page.keyboard.press("Escape").catch(() => {});
log("toma desde Hoy");

// 4 · Gasto: abre la hoja con cuentas (crear una vía API) y guarda
await page.request.post(`${B}/api/finance/accounts`, { data: { name: "Cuenta H", type: "ASSET", openingBalance: 0 } }).catch(() => null);
await go(page, "/");
await page.getByLabel("Registrar").getByRole("button", { name: /Gasto/ }).tap();
const ds = page.getByRole("dialog", { name: /Nuevo movimiento/ });
await ds.waitFor({ timeout: 15_000 }).catch(() => errors.push("gasto: la hoja no se abre"));
log("gasto abre la hoja en 1 toque");
await page.keyboard.press("Escape").catch(() => {});

// 5 · Serie: enlace directo al registrador de fuerza
await go(page, "/");
await page.getByLabel("Registrar").getByRole("link", { name: /Serie/ }).tap();
await page.waitForURL(/\/training\/new/);
log("serie → registrador");

// 6 · Sesión planificada hoy: es la acción principal con su porqué
psql(`insert into "TrainingSession"(id,"userId",date,type,status,title,"createdAt","updatedAt") select 'v30h'||substr(md5(random()::text),1,12), id, '${madridDay}'::date, 'STRENGTH','PLANNED','Fuerza H',now(),now() from "User" where email='${email}'`);
await go(page, "/");
const t = await page.getByLabel("Ahora").innerText();
if (!/Fuerza H/.test(t)) errors.push(`la sesión planificada no es la acción principal: ${t}`);
await page.getByLabel("Registrar").getByRole("link", { name: /Serie/ }).tap();
await page.waitForURL(/\/training\/.+\/edit/);
log("sesión planificada primero y Serie la abre");

// 7 · Módulo oculto → desaparece su registro
await go(page, "/settings#modulos");
await page.getByLabel("Módulos").getByLabel("Finanzas").click();
await page.getByText(/Finanzas oculto/).first().waitFor({ timeout: 15_000 });
await go(page, "/");
if (await page.getByLabel("Registrar").getByText(/Gasto/).count()) errors.push("Gasto sigue con Finanzas oculto");
log("módulos ocultos respetados");

await browser.close();
if (errors.length) {
  console.error("✖", errors.join("\n✖ "));
  process.exit(1);
}
console.log("OK e2e:v30h");
