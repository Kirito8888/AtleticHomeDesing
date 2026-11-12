// Medida (no suite de regresión) · v2.11 B3 / O16: coste de una acción diaria en Finanzas y Nutrición.
// Por acción cuenta, entre el clic y la pantalla ya actualizada: peticiones RSC (repintado global de Next, cabecera `rsc`),
// peticiones `/api/` y sentencias de Postgres (offset del log, mismo método que `v24a`). Solo BD de desarrollo.
//   sh scripts/dev/e2e.sh e2e:refresh-cost       (build + servidor en :3100; usa BASE_URL y PG_LOG si se cambian)
// Fuera de `e2e.sh all`: imprime una tabla; para comparar antes/después se ejecuta con y sin el cambio.
import { execFileSync } from "node:child_process";
import { closeSync, existsSync, openSync, readSync, statSync } from "node:fs";

import { chromium } from "playwright-core";

const B = process.env.BASE_URL ?? "http://localhost:3100";
const PG_LOG = process.env.PG_LOG ?? "/tmp/lifeos-pg/log";
const dbUrl = (process.env.DATABASE_URL ?? "").replace(/\?.*$/, "");
const psql = (sql: string) => execFileSync("psql", [dbUrl, "-qAt", "-c", sql], { encoding: "utf8" });
const readFrom = (offset: number) => {
  const size = statSync(PG_LOG).size;
  const buf = Buffer.alloc(Math.max(0, size - offset));
  const fd = openSync(PG_LOG, "r");
  readSync(fd, buf, 0, buf.length, offset);
  closeSync(fd);
  return buf.toString("utf8");
};
const countStatements = (text: string) =>
  [...text.matchAll(/duration: ([\d.]+) ms\s+(?:execute [^:]*|statement): ([^\n]*)/g)].filter((m) => !/^(BEGIN|COMMIT|ROLLBACK|SELECT pg_|SET |DEALLOCATE)/i.test(m[2])).length;

const withPg = existsSync(PG_LOG) && Boolean(dbUrl);
if (withPg) {
  psql("ALTER SYSTEM SET log_min_duration_statement = 0");
  psql("SELECT pg_reload_conf()");
  await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.199" } });
const page = await ctx.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
let rsc = 0;
let api = 0;
page.on("request", (r) => {
  const u = new URL(r.url());
  if (r.headers()["rsc"] === "1" || u.searchParams.has("_rsc")) rsc++;
  else if (u.pathname.startsWith("/api/") && r.method() !== "OPTIONS") api++;
});
const toast = (re: RegExp) => page.locator("[data-sonner-toast]", { hasText: re }).first().waitFor({ timeout: 8000 });

const rows: Array<{ accion: string; rsc: number; api: number; sql: number | null }> = [];
async function measure(accion: string, act: () => Promise<void>) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300);
  rsc = 0;
  api = 0;
  const off = withPg ? statSync(PG_LOG).size : 0;
  await act();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  rows.push({ accion, rsc, api, sql: withPg ? countStatements(readFrom(off)) : null });
}

try {
  const email = `refcost${Date.now()}@test.dev`;
  const out = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", "Atleta", "--role", "ATHLETE", "--accept-terms"], { encoding: "utf8" });
  const pw = out.match(/Contraseña: (\S+)/)?.[1];
  if (!pw) throw new Error("no se pudo crear la cuenta");
  await page.goto(B + "/login");
  await page.waitForLoadState("networkidle");
  await page.fill("#email", email);
  await page.fill("#password", pw);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);

  // Datos de partida: una cuenta y 12 movimientos (la página lista los 12 últimos)
  await page.goto(B + "/finance");
  await page.getByRole("button", { name: "Cuenta", exact: true }).click();
  await page.fill("#a-name", "Cuenta corriente");
  await page.fill("#a-open", "1000");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await toast(/Cuenta creada/);
  const accounts = (await (await page.request.get(B + "/api/finance/accounts")).json()) as Array<{ id: string; name: string }>;
  const cats = (await (await page.request.get(B + "/api/finance/categories")).json()) as Array<{ id: string; name: string; kind: string }>;
  const food = cats.find((c) => c.name === "Comida") ?? cats.find((c) => c.kind === "EXPENSE")!;
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
  for (let i = 0; i < 12; i++) {
    const r = await page.request.post(B + "/api/finance/transactions", { data: { mode: "simple", date: day, kind: "EXPENSE", description: `Base ${i}`, amountCents: 500 + i, moneyAccountId: accounts[0].id, categoryId: food.id } });
    if (!r.ok()) throw new Error(`no se pudo sembrar un movimiento: ${r.status()} ${await r.text()}`);
  }
  for (let i = 0; i < 4; i++) {
    const r = await page.request.post(B + "/api/nutrition/entries", { data: { date: day, mealType: i % 2 ? "LUNCH" : "BREAKFAST", customName: `Comida ${i}`, quantityG: 100, kcal: 100, proteinG: 5, carbsG: 10, fatG: 2 } });
    if (!r.ok()) throw new Error(`no se pudo sembrar una toma: ${r.status()}`);
  }

  // 1 · /finance: añadir un gasto
  await page.goto(B + "/finance");
  await measure("/finance · añadir gasto", async () => {
    await page.getByRole("button", { name: "Movimiento", exact: true }).click();
    await page.getByRole("radio", { name: "Gasto" }).click();
    await page.fill("#t-amount", "30");
    await page.fill("#t-desc", "Medida súper");
    await page.selectOption("#t-cat", { label: food.name });
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await toast(/Movimiento guardado/);
    await page.getByRole("region", { name: "Últimos movimientos" }).getByText("Medida súper").waitFor();
  });

  // 2 · /finance: editar ese gasto
  await measure("/finance · editar gasto", async () => {
    await page.locator("li", { hasText: "Medida súper" }).first().getByRole("button", { name: "Editar" }).click();
    await page.getByRole("dialog").getByLabel("Concepto").fill("Medida súper 2");
    await page.getByRole("dialog").getByRole("button", { name: "Guardar cambios" }).click();
    await page.getByRole("region", { name: "Últimos movimientos" }).getByText("Medida súper 2").waitFor();
  });

  // 3 · /finance: borrar
  await measure("/finance · borrar gasto", async () => {
    await page.locator("li", { hasText: "Medida súper 2" }).first().getByRole("button", { name: "Borrar" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Borrar" }).click();
    await page.getByText("Medida súper 2").first().waitFor({ state: "detached" });
  });

  // 4 · /finance/history: borrar
  await page.goto(B + "/finance/history");
  await measure("/finance/history · borrar movimiento", async () => {
    await page.locator("li", { hasText: "Base 3" }).first().getByRole("button", { name: "Borrar" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Borrar" }).click();
    await page.getByText("Base 3", { exact: true }).first().waitFor({ state: "detached" });
  });

  // 5 · /nutrition: +250 ml de agua
  await page.goto(B + "/nutrition");
  await measure("/nutrition · +250 ml de agua", async () => {
    await page.getByRole("button", { name: "+250 ml" }).click();
    await page.getByRole("region", { name: "Agua" }).getByText(/0,25/).first().waitFor();
  });

  // 6 · /nutrition: quitar un alimento
  await measure("/nutrition · quitar alimento", async () => {
    await page.getByRole("button", { name: /Quitar Comida 0|Quitar.*Comida 0/ }).first().click();
    const confirm = page.getByRole("alertdialog");
    if (await confirm.count()) await confirm.getByRole("button", { name: /Quitar|Borrar|Sí/ }).click();
    await page.getByText("Comida 0", { exact: true }).first().waitFor({ state: "detached" });
  });
} catch (e) {
  errors.push(String((e as Error).stack ?? e));
} finally {
  if (withPg) {
    psql("ALTER SYSTEM RESET log_min_duration_statement");
    psql("SELECT pg_reload_conf()");
  }
  await browser.close();
}

console.log("\n| Acción | Peticiones RSC | Peticiones /api | Sentencias SQL |\n|---|---|---|---|");
for (const r of rows) console.log(`| ${r.accion} | ${r.rsc} | ${r.api} | ${r.sql ?? "n/d"} |`);
if (errors.length) {
  console.error("\nERRORES:\n" + errors.join("\n"));
  process.exit(1);
}
