// E2E del bloque «Finanzas: presupuestos mensuales y distribución» en un móvil de 390 px (necesita build de producción y DATABASE_URL).
//   BASE_URL=http://localhost:3000 npm run e2e:v25j
import { execFileSync } from "node:child_process";

import { chromium } from "playwright-core";

const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.180" } });
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

const email = `v25j${Date.now()}@test.dev`;
const out = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", "Atleta", "--role", "ATHLETE", "--accept-terms"], { encoding: "utf8" });
const pw = out.match(/Contraseña: (\S+)/)?.[1];
if (!pw) throw new Error("no se pudo crear la cuenta");
await page.goto(B + "/login");
await page.fill("#email", email);
await page.fill("#password", pw);
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);

const addAccount = async (name: string, open: string) => {
  await page.getByRole("button", { name: "Cuenta", exact: true }).click();
  await page.fill("#a-name", name);
  await page.fill("#a-open", open);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await toast(/Cuenta creada/);
};
const addTx = async (kind: "Gasto" | "Ingreso", amount: string, desc: string, account?: string, category?: string) => {
  await page.getByRole("button", { name: "Movimiento", exact: true }).click();
  await page.getByRole("radio", { name: kind }).click();
  await page.fill("#t-amount", amount);
  await page.fill("#t-desc", desc);
  if (account) await page.selectOption("#t-acc", { label: account });
  if (category) await page.selectOption("#t-cat", { label: category });
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await toast(/Movimiento guardado/);
};

await page.goto(B + "/finance");
await page.waitForLoadState("networkidle");
await addAccount("Banco", "1000");

const month = new Date().toISOString().slice(0, 7);
const prevMonth = (() => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
})();

await addTx("Gasto", "160", "Compra grande", "Banco", "Comida");
await addTx("Gasto", "40", "Cine", "Banco", "Ocio");
log("preparado: 160 € en Comida y 40 € en Ocio");

// 1 · Pantalla de presupuestos desde Finanzas
await page.getByRole("link", { name: "Presupuestos del mes" }).click();
await page.waitForURL(/\/finance\/budgets/);
await page.getByRole("heading", { name: "Presupuestos del mes" }).waitFor();
await page.getByRole("img", { name: "Distribución del gasto del mes" }).waitFor();
await page.getByText("Sin presupuestos este mes").waitFor();
const reparto = page.getByRole("list").filter({ hasText: "Comida" }).first();
await reparto.getByText(/80 %/).waitFor();
await noOverflow("/finance/budgets vacío");
log("distribución del mes: Comida 80 %, Ocio 20 %");

// 2 · Fijar 200 € a Comida: 160/200 = 80 % → aviso
await minH(page.getByRole("button", { name: "Nuevo presupuesto" }), "«Nuevo presupuesto»");
await page.getByRole("button", { name: "Nuevo presupuesto" }).click();
await page.getByLabel("Categoría").selectOption({ label: "Comida" });
await page.getByLabel("Límite al mes (€)").fill("200");
await minH(page.getByRole("button", { name: "Guardar presupuesto" }), "«Guardar presupuesto»");
await page.getByRole("button", { name: "Guardar presupuesto" }).click();
await toast(/Presupuesto guardado/);
const card = page.locator("li[data-state]", { hasText: "Comida" });
await card.getByText(/160,00\s€ \/ 200,00\s€ · 80 %/).waitFor();
await card.getByText(/Te quedan 40,00\s€/).waitFor();
if ((await card.getAttribute("data-state")) !== "WARNING") errors.push("al 80 % debería estar en aviso");
await noOverflow("/finance/budgets con presupuesto");
log("160 de 200 € = 80 %, aviso");

// 3 · Gastar 60 € más: 220/200 = 110 % → excedido
await page.goto(B + "/finance");
await addTx("Gasto", "60", "Mercado", "Banco", "Comida");
await page.goto(B + "/finance/budgets");
await card.getByText(/220,00\s€ \/ 200,00\s€ · 110 %/).waitFor();
await card.getByText(/Excedido en 20,00\s€/).waitFor();
if ((await card.getAttribute("data-state")) !== "EXCEEDED") errors.push("al 110 % debería estar excedido");
await noOverflow("/finance/budgets excedido");
log("220 de 200 € = 110 %, excedido en 20 €");

// 4 · Editar a 300 € (73 %) y comparar con el mes anterior, que no cambia
await minH(card.getByRole("button", { name: "Editar" }), "«Editar»");
await card.getByRole("button", { name: "Editar" }).click();
await page.getByLabel("Límite al mes (€)").fill("300");
await page.getByRole("button", { name: "Guardar presupuesto" }).click();
await toast(/Presupuesto guardado/);
await card.getByText(/220,00\s€ \/ 300,00\s€ · 73,3 %/).waitFor();
await minH(page.getByRole("link", { name: "Mes anterior" }), "«Mes anterior»");
await page.getByRole("link", { name: "Mes anterior" }).click();
await page.waitForURL(new RegExp(`month=${prevMonth}`));
await page.getByText("Sin presupuestos este mes").waitFor();
await page.getByText("Sin gastos registrados este mes").waitFor();
await page.getByRole("link", { name: "Mes siguiente" }).click();
await page.waitForURL(new RegExp(`month=${month}`));
await card.waitFor();
await noOverflow("/finance/budgets mes anterior y vuelta");
log("editar a 300 € y selector de mes");

// 5 · Gasto sin presupuesto → fijar límite; quitar con confirmación
await page.getByRole("region", { name: "Gasto sin presupuesto" }).getByRole("button", { name: "Fijar límite" }).click();
await page.getByLabel("Límite al mes (€)").fill("50");
await page.getByRole("button", { name: "Guardar presupuesto" }).click();
await toast(/Presupuesto guardado/);
const ocio = page.locator("li[data-state]", { hasText: "Ocio" });
await ocio.getByText(/40,00\s€ \/ 50,00\s€ · 80 %/).waitFor();
await ocio.getByRole("button", { name: "Editar" }).click();
await page.getByRole("button", { name: "Quitar presupuesto" }).click();
await page.getByRole("alertdialog").getByRole("button", { name: "Quitar" }).click();
await toast(/Presupuesto quitado/);
await page.getByRole("region", { name: "Gasto sin presupuesto" }).waitFor();
await noOverflow("/finance/budgets tras quitar");
log("fijar desde gasto sin presupuesto y quitar");

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v25j");
