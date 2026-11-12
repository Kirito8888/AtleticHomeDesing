// E2E del bloque «Finanzas: historial, edición y filtros» en un móvil de 390 px (necesita build de producción y DATABASE_URL).
//   BASE_URL=http://localhost:3000 npm run e2e:v25i
import { execFileSync } from "node:child_process";

import { chromium } from "playwright-core";

const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.179" } });
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
const balance = () => page.getByRole("region", { name: "Balance total" });

// v2.11 B3 · O16: las acciones recargan solo su zona (GET JSON), sin repintado global de Next (peticiones RSC)
let rscCount = 0;
page.on("request", (r) => {
  if (r.headers()["rsc"] === "1") rscCount++;
});

const email = `v25i${Date.now()}@test.dev`;
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
const addTx = async (kind: "Gasto" | "Ingreso", amount: string, desc: string, account?: string) => {
  await page.getByRole("button", { name: "Movimiento", exact: true }).click();
  await page.getByRole("radio", { name: kind }).click();
  await page.fill("#t-amount", amount);
  await page.fill("#t-desc", desc);
  if (account) await page.getByRole("radiogroup", { name: kind === "Ingreso" ? "Cuenta de cobro" : "Desde" }).getByRole("radio", { name: new RegExp(account) }).click();
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await toast(/Movimiento guardado/);
};

await page.goto(B + "/finance");
await page.waitForLoadState("networkidle");
await addAccount("Banco", "100");
await addAccount("Efectivo", "20");
await addTx("Gasto", "20", "Súper", "Banco");
await addTx("Ingreso", "50", "Beca", "Banco");
await balance().getByText(/150,00\s€/).first().waitFor();
log("preparado: Banco 130 €, Efectivo 20 €, balance 150 €");

// 1 · Historial
await page.getByRole("link", { name: "Ver historial y filtros" }).click();
await page.waitForURL(/\/finance\/history/);
await page.getByRole("heading", { name: "Historial" }).waitFor();
const saldo = () => page.getByRole("region", { name: "Saldo" });
await saldo().getByText(/150,00\s€/).waitFor();
await page.getByText("Súper").first().waitFor();
await page.getByText("Beca").first().waitFor();
await noOverflow("/finance/history");
log("historial con todos los movimientos");

// 2 · Filtros táctiles: tipo y cuenta
const tipo = page.getByRole("navigation", { name: "Tipo de movimiento" });
await minH(tipo.getByRole("link", { name: "Gastos" }), "chip «Gastos»");
await minH(page.getByRole("button", { name: "Aplicar filtros" }), "«Aplicar filtros»");
await minH(page.getByLabel("Cuenta", { exact: true }), "selector de cuenta");
await tipo.getByRole("link", { name: "Gastos" }).click();
await page.waitForURL(/kind=expense/);
await page.getByText("Súper").first().waitFor();
if (await page.getByText("Beca").count()) errors.push("el filtro Gastos muestra un ingreso");
await page.getByLabel("Cuenta", { exact: true }).selectOption({ label: "Efectivo" });
await page.getByRole("button", { name: "Aplicar filtros" }).click();
await page.waitForURL(/account=/);
await page.getByText("Ningún movimiento con estos filtros").waitFor();
await saldo().getByText(/20,00\s€/).waitFor();
await noOverflow("/finance/history filtrado");
await page.getByRole("link", { name: "Quitar filtros" }).first().click();
await page.waitForURL((u) => !u.search);
log("filtros por tipo y cuenta");

// 3 · Editar gasto 20 → 50 €: balance 150 → 120 €
await page.getByRole("button", { name: "Editar" }).last().waitFor();
const row = page.locator("li", { hasText: "Súper" }).first();
await minH(row.getByRole("button", { name: "Editar" }), "«Editar»");
await row.getByRole("button", { name: "Editar" }).click();
await page.getByLabel("Importe (€)").fill("50");
await minH(page.getByRole("button", { name: "Guardar cambios" }), "«Guardar cambios»");
await page.getByRole("button", { name: "Guardar cambios" }).click();
await toast(/Movimiento actualizado/);
await saldo().getByText(/120,00\s€/).waitFor();
await page.locator("li", { hasText: "Súper" }).first().getByText(/50,00\s€/).waitFor();
log("editar 20 → 50 €: balance 120 €");

// 4 · Borrar el gasto con confirmación: balance 170 €
await page.waitForLoadState("networkidle");
rscCount = 0;
await page.locator("li", { hasText: "Súper" }).first().getByRole("button", { name: "Borrar" }).click();
await page.getByRole("alertdialog").getByRole("button", { name: "Borrar" }).click();
await toast(/Movimiento borrado/);
await saldo().getByText(/170,00\s€/).waitFor();
if (await page.getByText("Súper").count()) errors.push("el gasto borrado sigue en el listado");
await page.waitForTimeout(500);
if (rscCount) errors.push(`borrar repintó la página entera (${rscCount} peticiones RSC)`);
await noOverflow("/finance/history tras borrar");
log("borrar con confirmación: balance 170 €");

// 5 · Editar una transferencia y un asiento partido (N6): los saldos cuadran al instante
const accountsApi = async () => (await (await page.request.get(B + "/api/finance/accounts")).json()) as Array<{ id: string; name: string; balanceCents: number }>;
const bal = async (name: string) => (await accountsApi()).find((x) => x.name === name)!.balanceCents;
const ids = Object.fromEntries((await accountsApi()).map((x) => [x.name, x.id]));
const post = async (data: object) => {
  const r = await page.request.post(B + "/api/finance/transactions", { data });
  if (r.status() !== 201 && r.status() !== 200) errors.push(`alta por API: ${r.status()}`);
};
await post({ mode: "simple", kind: "TRANSFER", date: "2026-10-06", description: "Traspaso", amountCents: 3000, moneyAccountId: ids["Banco"], counterAccountId: ids["Efectivo"] });
await post({ mode: "split", kind: "EXPENSE", date: "2026-10-07", description: "Compra mixta", postings: [{ accountId: ids["Gastos"], amountCents: 3000 }, { accountId: ids["Gastos"], amountCents: 2000 }, { accountId: ids["Banco"], amountCents: -5000 }] });
await page.goto(B + "/finance/history");
await saldo().getByText(/120,00\s€/).waitFor();

const trow = page.locator("li", { hasText: "Traspaso" }).first();
await minH(trow.getByRole("button", { name: "Editar" }), "«Editar» de la transferencia");
await trow.getByRole("button", { name: "Editar" }).click();
await page.getByLabel("Importe (€)").fill("45");
await minH(page.getByRole("button", { name: "Guardar cambios" }), "«Guardar cambios» de la transferencia");
await noOverflow("hoja de editar transferencia");
await page.getByRole("button", { name: "Guardar cambios" }).click();
await toast(/Movimiento actualizado/);
await saldo().getByText(/120,00\s€/).waitFor();
if ((await bal("Banco")) !== 15000 - 4500 - 5000 || (await bal("Efectivo")) !== 6500) errors.push("saldos tras editar la transferencia no cuadran");
log("transferencia 30 → 45 €: saldos por cuenta y total al instante");

const srow = page.locator("li", { hasText: "Compra mixta" }).first();
await minH(srow.getByRole("button", { name: "Editar" }), "«Editar» del asiento");
await srow.getByRole("button", { name: "Editar" }).click();
const amounts = page.getByLabel(/^Importe de la línea/);
const values = await amounts.evaluateAll((els) => (els as HTMLInputElement[]).map((e) => e.value));
const iFirst = values.findIndex((v) => /^30,00$/.test(v));
const iPay = values.findIndex((v) => /^-50,00$/.test(v));
if (iFirst < 0 || iPay < 0) errors.push(`líneas del asiento no esperadas: ${values.join(" | ")}`);
await amounts.nth(iFirst).fill("35,00");
await page.getByText(/Descuadre/).waitFor();
if (!(await page.getByRole("button", { name: "Guardar cambios" }).isDisabled())) errors.push("«Guardar» no se deshabilita con el asiento descuadrado");
await amounts.nth(iPay).fill("-55,00");
await page.getByText("Cuadra", { exact: true }).waitFor();
await noOverflow("hoja de editar asiento");
await page.getByRole("button", { name: "Guardar cambios" }).click();
await toast(/Movimiento actualizado/);
await saldo().getByText(/115,00\s€/).waitFor();
if ((await bal("Banco")) !== 15000 - 4500 - 5500) errors.push("saldo de Banco tras editar el asiento no cuadra");
log("asiento partido 50 → 55 €: descuadre bloquea, al cuadrar el total baja a 115 €");

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v25i");
