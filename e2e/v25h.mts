// E2E del bloque «Finanzas: cuentas y movimientos» en un móvil de 390 px (necesita build de producción y DATABASE_URL).
//   BASE_URL=http://localhost:3000 npm run e2e:v25h
import { execFileSync } from "node:child_process";

import { chromium } from "playwright-core";

const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.178" } });
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

const email = `v25h${Date.now()}@test.dev`;
const out = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", "Atleta", "--role", "ATHLETE", "--accept-terms"], { encoding: "utf8" });
const pw = out.match(/Contraseña: (\S+)/)?.[1];
if (!pw) throw new Error("no se pudo crear la cuenta");
await page.goto(B + "/login");
await page.fill("#email", email);
await page.fill("#password", pw);
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);

// 1 · Vista vacía: balance 0 y botones táctiles
await page.goto(B + "/finance");
await page.waitForLoadState("networkidle");
await balance().getByText(/^0,00\s€$/).waitFor();
await minH(page.getByRole("button", { name: "Cuenta", exact: true }), "«Cuenta»");
await minH(page.getByRole("button", { name: "Movimiento", exact: true }), "«Movimiento»");
await noOverflow("/finance vacío");
log("vista vacía con balance 0");

// 2 · Cuenta en un paso con saldo inicial
await page.getByRole("button", { name: "Cuenta", exact: true }).click();
await page.fill("#a-name", "Cuenta corriente");
await page.fill("#a-open", "100");
await minH(page.getByRole("button", { name: "Crear cuenta" }), "«Crear cuenta»");
await page.getByRole("button", { name: "Crear cuenta" }).click();
await toast(/Cuenta creada/);
await balance().getByText(/100,00\s€/).first().waitFor();
await page.getByRole("list", { name: "Cuentas" }).getByText("Cuenta corriente").waitFor();
log("cuenta con 100 € y balance actualizado");

// 3 · Ingreso 50 €
await page.getByRole("button", { name: "Movimiento", exact: true }).click();
await page.getByRole("radio", { name: "Ingreso" }).click();
await page.fill("#t-amount", "50");
await page.fill("#t-desc", "Beca");
await page.selectOption("#t-cat", { label: "Becas y premios" });
await page.getByRole("button", { name: "Guardar", exact: true }).click();
await toast(/Movimiento guardado/);
await balance().getByText(/150,00\s€/).first().waitFor();

// 4 · Gasto 30 €
await page.getByRole("button", { name: "Movimiento", exact: true }).click();
await page.getByRole("radio", { name: "Gasto" }).click();
await page.fill("#t-amount", "30");
await page.fill("#t-desc", "Súper");
await page.selectOption("#t-cat", { label: "Comida" });
await page.getByRole("button", { name: "Guardar", exact: true }).click();
await toast(/Movimiento guardado/);
await balance().getByText(/120,00\s€/).first().waitFor();
await page.getByRole("list", { name: "Cuentas" }).getByText(/120,00\s€/).waitFor();
await page.getByRole("region", { name: "Últimos movimientos" }).getByText("Súper").waitFor();
await noOverflow("/finance con movimientos");
log("100 + 50 − 30 = 120 € en balance y tarjeta");

// 4a · Atajos de categorías frecuentes (N10): un toque rellena solo la categoría
await page.reload();
await page.getByRole("button", { name: "Movimiento", exact: true }).click();
await page.fill("#t-amount", "7");
const chip = page.getByTestId("cat-chip").filter({ hasText: "Comida" });
await chip.waitFor();
await minH(chip, "chip de categoría");
await chip.click();
if ((await page.locator("#t-cat option:checked").innerText()) !== "Comida") errors.push("el chip no selecciona la categoría");
if ((await page.inputValue("#t-amount")) !== "7") errors.push("el chip tocó el importe");
if ((await chip.getAttribute("aria-pressed")) !== "true") errors.push("el chip no queda marcado");
await page.getByRole("radio", { name: "Ingreso" }).click();
if ((await page.inputValue("#t-cat")) !== "") errors.push("la categoría no se vació al cambiar de tipo");
if (await page.getByTestId("cat-chip").filter({ hasText: "Comida" }).count()) errors.push("«Comida» no debe salir en ingresos");
await noOverflow("registro rápido con atajos");
await page.keyboard.press("Escape");
log("atajos de categoría: un toque, importe intacto, separados por tipo");

// 4b · Segunda cuenta (tarjeta) y selector de un toque
await page.getByRole("button", { name: "Cuenta", exact: true }).click();
await page.fill("#a-name", "Visa");
await page.getByRole("radio", { name: "Tarjeta de crédito" }).click();
await page.getByRole("button", { name: "Crear cuenta" }).click();
await toast(/Cuenta creada/);
await page.getByRole("button", { name: "Movimiento", exact: true }).click();
await page.getByRole("radio", { name: "Ingreso" }).click();
const picker = page.getByRole("radiogroup", { name: "Cuenta de cobro" });
await picker.waitFor();
for (const r of await picker.getByRole("radio").all()) await minH(r, "opción de cuenta");
await picker.getByRole("radio", { name: /Visa/ }).click();
await page.fill("#t-amount", "20");
await page.fill("#t-desc", "Premio");
await noOverflow("hoja de movimiento con dos cuentas");
await page.getByRole("button", { name: "Guardar", exact: true }).click();
await toast(/Movimiento guardado/);
const cards = page.getByRole("list", { name: "Cuentas" });
await cards.getByText(/120,00\s€/).waitFor();
await cards.locator("li", { hasText: "Visa" }).getByText(/20,00\s€/).waitFor();
// Recuerda la última elegida al apuntar de nuevo
await page.getByRole("button", { name: "Movimiento", exact: true }).click();
const again = page.getByRole("radiogroup", { name: "Cuenta de cobro" });
await again.getByRole("radio", { name: /Visa/ }).waitFor();
if ((await again.getByRole("radio", { name: /Visa/ }).getAttribute("aria-checked")) !== "true") errors.push("no recuerda la última cuenta");
await page.keyboard.press("Escape");
log("ingreso en la tarjeta elegida, saldos por cuenta y última cuenta recordada");

// 4c · Archivar la tarjeta (C4): avisa del saldo, sale de tarjetas y selector, el servidor rechaza apuntes, se reactiva
const accountsApi = async () => (await (await page.request.get(B + "/api/finance/accounts")).json()) as Array<{ id: string; name: string; balanceCents: number; isArchived: boolean }>;
const visaId = (await accountsApi()).find((x) => x.name === "Visa")!.id;
await minH(cards.locator("li", { hasText: "Visa" }).getByRole("button", { name: "Archivar Visa" }), "«Archivar»");
await cards.locator("li", { hasText: "Visa" }).getByRole("button", { name: "Archivar Visa" }).click();
await page.getByRole("alertdialog").getByText(/Tiene 20,00\s€/).waitFor();
await page.getByRole("alertdialog").getByRole("button", { name: "Archivar" }).click();
await toast(/Cuenta archivada/);
await cards.locator("li", { hasText: "Visa" }).waitFor({ state: "detached" });
await balance().getByText(/140,00\s€/).first().waitFor();
await page.getByRole("button", { name: "Movimiento", exact: true }).click();
if (await page.getByRole("radiogroup", { name: "Desde" }).getByRole("radio", { name: /Visa/ }).count()) errors.push("la cuenta archivada sigue en el selector de movimientos");
await page.keyboard.press("Escape");
const blocked = await page.request.post(B + "/api/finance/transactions", { data: { mode: "simple", kind: "EXPENSE", date: "2026-10-05", description: "Intruso", amountCents: 100, moneyAccountId: visaId } });
if (blocked.status() !== 409) errors.push(`apuntar en una archivada devolvió ${blocked.status()} (esperado 409)`);
const summary = page.getByText(/Archivadas \(1\)/);
await minH(summary, "«Archivadas»");
await summary.click();
await minH(page.getByRole("button", { name: "Reactivar Visa" }), "«Reactivar»");
await noOverflow("/finance con una cuenta archivada");
await page.getByRole("button", { name: "Reactivar Visa" }).click();
await toast(/Cuenta reactivada/);
await cards.locator("li", { hasText: "Visa" }).waitFor();
log("archivar con aviso de saldo, 409 en servidor y reactivar");

// 5 · Resto de secciones movidas, sin desborde
await page.goto(B + "/finance/more");
await page.getByText("Fondo de emergencia").first().waitFor();
await noOverflow("/finance/more");
log("presupuestos y temporada en su página");

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v25h");
