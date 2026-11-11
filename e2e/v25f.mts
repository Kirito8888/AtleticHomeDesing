// E2E del bloque «confirmaciones, accesibilidad y formatos» en un móvil de 390 px (necesita build de producción y DATABASE_URL).
//   BASE_URL=http://localhost:3000 npm run e2e:v25f
import { execFileSync } from "node:child_process";

import { chromium } from "playwright-core";

import { a11y } from "./a11y.mjs";

const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.176" } });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
// Un diálogo nativo del navegador es un fallo: todo pasa por el ConfirmDialog de la app.
page.on("dialog", (d) => {
  errors.push(`diálogo nativo (${d.type()}): ${d.message()}`);
  void d.dismiss();
});
const noOverflow = async (where: string) => {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  if (w > 392) errors.push(`${where}: desborda en horizontal (${w}px)`);
};
const minH = async (loc: ReturnType<typeof page.locator>, what: string) => {
  const h = (await loc.first().boundingBox())?.height ?? 0;
  if (h < 44) errors.push(`${what} mide ${h}px (< 44)`);
};

const email = `v25f${Date.now()}@test.dev`;
const out1 = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", "Amiga", "--role", "ATHLETE", "--accept-terms"], { encoding: "utf8" });
const pw = out1.match(/Contraseña: (\S+)/)?.[1];
if (!pw) throw new Error("no se pudo crear la cuenta");
await page.goto(B + "/login");
await page.fill("#email", email);
await page.fill("#password", pw);
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);

// 1 · Saltar al contenido: primer Tab, foco visible, lleva a #main
await page.goto(B + "/");
await page.waitForLoadState("networkidle");
await page.keyboard.press("Tab");
const skip = page.getByRole("link", { name: "Saltar al contenido" });
if (!(await skip.evaluate((el) => el === document.activeElement))) errors.push("el primer Tab no enfoca «Saltar al contenido»");
await page.keyboard.press("Enter");
if (!page.url().endsWith("#main")) errors.push(`«Saltar al contenido» no va a #main (${page.url()})`);
if (!(await page.locator("main#main").count())) errors.push("falta main#main");
log("saltar al contenido");

// 2 · Barra inferior: etiquetas ≥ 12 px
const sizes = await page.$$eval('nav[aria-label="Navegación principal"] > a, nav[aria-label="Navegación principal"] > button', (els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
if (!sizes.length || sizes.some((s) => s < 12)) errors.push(`etiquetas de la barra inferior < 12 px: ${sizes.join(",")}`);
log("barra inferior en text-xs");

// 3 · Vacíos de una cuenta nueva: Inicio, finanzas y recuperación
for (const [path, title, button] of [
  ["/", "Empieza por tu primer entreno", "Registrar mi primer entreno"],
  ["/finance", "Aún no hay movimientos", "Añadir un movimiento"],
  ["/recovery", "Aún no hay registros de recuperación", "Registrar cómo estoy"],
] as const) {
  await page.goto(B + path);
  await page.waitForLoadState("networkidle");
  const es = page.locator('[data-slot="empty-state"]', { hasText: title });
  await es.waitFor({ timeout: 8000 }).catch(() => errors.push(`${path}: no sale el vacío «${title}»`));
  const btn = es.getByRole("link", { name: button });
  if (await btn.count()) await minH(btn, `«${button}»`);
  else errors.push(`${path}: falta el botón «${button}»`);
  await noOverflow(`vacío ${path}`);
  errors.push(...(await a11y(page, `vacío ${path}`)));
}
log("vacíos con salida en Inicio, finanzas y recuperación");

// 4 · Confirmación de la app (objetivo creado por API)
const created = await page.request.post(B + "/api/goals", { data: { kind: "CUSTOM", title: "Meta v25f", target: 10, current: 2, unit: "km", higherIsBetter: true } });
if (created.status() !== 201) errors.push(`crear objetivo: ${created.status()}`);
await page.goto(B + "/goals");
await page.getByText("Meta v25f").first().waitFor();
const del = page.getByRole("button", { name: "Borrar Meta v25f" });
await minH(del, "borrar objetivo");
await del.tap();
const dlg = page.getByRole("alertdialog");
await dlg.waitFor();
await noOverflow("diálogo de confirmación");
for (const name of ["Cancelar", "Borrar"]) await minH(dlg.getByRole("button", { name, exact: true }), `diálogo «${name}»`);
errors.push(...(await a11y(page, "diálogo de confirmación")));
await dlg.getByRole("button", { name: "Cancelar" }).tap();
await dlg.waitFor({ state: "detached" });
if (!(await page.getByText("Meta v25f").count())) errors.push("Cancelar borró el objetivo");
await del.tap();
await page.getByRole("alertdialog").getByRole("button", { name: "Borrar", exact: true }).tap();
await page.getByText("Meta v25f").waitFor({ state: "detached", timeout: 8000 }).catch(() => errors.push("Borrar no quitó el objetivo"));
log("ConfirmDialog: cancelar conserva, borrar borra, sin diálogo nativo");

// 5 · Prehab: los puntos tienen texto alternativo
await page.goto(B + "/training/prehab");
await page.waitForLoadState("networkidle");
const plantilla = page.getByRole("button", { name: /Añadir|plantilla/i }).first();
if (await plantilla.count()) {
  await plantilla.tap().catch(() => undefined);
}
const vacio = await page.locator('[data-slot="empty-state"]', { hasText: "Aún no tienes rutinas de prehab" }).count();
if (!vacio && !(await page.locator('[role="img"][aria-label^="Últimos 7 días"]').count())) errors.push("prehab: sin vacío ni puntos con texto alternativo");
await noOverflow("prehab");
log("prehab accesible");

// 6 · Formatos es-ES: ni fechas con barras ni decimales con punto en Ajustes ni en Inicio
for (const path of ["/", "/settings", "/finance"]) {
  await page.goto(B + path);
  await page.waitForLoadState("networkidle");
  const text = await page.locator("main").innerText();
  const bad = text.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b|\b\d+\.\d{1,2} (?:h|MB|GB|s|kg|km)\b/);
  if (bad) errors.push(`${path}: formato no español «${bad[0]}»`);
  await noOverflow(path);
}
log("fechas y cifras en formato español");

// 7 · Menús de comidas en Nutrición: guardar con Sheet (sin diálogo nativo), cargar en otra toma y desde «+ Alimento» en un día vacío
{
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
  const r = await page.request.post(B + "/api/nutrition/entries", {
    data: { date: today, mealType: "BREAKFAST", customName: "Tostada", quantityG: 80, kcal: 210, proteinG: 7, carbsG: 38, fatG: 3 },
  });
  if (!r.ok()) errors.push(`no se pudo crear la toma: ${r.status()}`);
  await page.goto(B + "/nutrition");
  await page.getByRole("button", { name: "Guardar desayuno como menú" }).click();
  await page.getByLabel("Nombre del menú").waitFor();
  errors.push(...(await a11y(page, "guardar menú")));
  await page.getByRole("button", { name: "Guardar menú" }).click();
  await page.getByText("«Menú desayuno» guardado en menús").first().waitFor();
  await page.getByRole("button", { name: "Cargar menú en desayuno" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Menú desayuno ·/ }).waitFor();
  errors.push(...(await a11y(page, "cargar menú")));
  await page.getByRole("dialog").getByRole("button", { name: /^Menú desayuno ·/ }).click();
  await page.getByText("«Menú desayuno» cargado en desayuno").first().waitFor();
  await page.waitForFunction(() => document.body.innerText.split("Tostada").length - 1 >= 2);
  await noOverflow("/nutrition");
  // Otro día (sin registros): «+ Alimento» → toma Cena → pestaña Menús → un toque vuelca todo.
  const empty = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date(Date.now() + 5 * 864e5));
  await page.goto(`${B}/nutrition?date=${empty}`);
  await page.getByRole("button", { name: /Alimento/ }).first().click();
  await page.getByRole("dialog").getByLabel("Comida").selectOption("DINNER");
  await page.getByRole("tab", { name: "Menús" }).click();
  errors.push(...(await a11y(page, "menús en añadir alimento")));
  await page.getByRole("dialog").getByRole("button", { name: /^Menú desayuno ·/ }).click();
  await page.getByText("«Menú desayuno» cargado en cena").first().waitFor();
  await page.waitForFunction(() => document.body.innerText.includes("Tostada"));
  await noOverflow("/nutrition");
}
log("menús de comidas: guardar, cargar en una toma y desde «+ Alimento» en un día vacío");

// 8 · Recientes / Habituales: en un día vacío, «+ Alimento» lista lo ya consumido y un toque precarga su cantidad habitual
{
  const empty = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date(Date.now() + 8 * 864e5));
  await page.goto(`${B}/nutrition?date=${empty}`);
  await page.getByRole("button", { name: /Alimento/ }).first().click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("heading", { name: "Recientes / Habituales" }).waitFor();
  errors.push(...(await a11y(page, "recientes en añadir alimento")));
  const recent = dlg.getByRole("button", { name: /^Tostada/ });
  await minH(recent, "reciente «Tostada»");
  await recent.click();
  const qty = await dlg.getByRole("textbox", { name: "Cantidad en gramos" }).inputValue();
  if (!/^80(,0+)?$/.test(qty)) errors.push(`el reciente no precarga la cantidad habitual (80 g): «${qty}»`);
  await dlg.getByRole("button", { name: "Añadir", exact: true }).click();
  await page.getByText("Añadido").first().waitFor();
  await page.waitForFunction(() => document.body.innerText.includes("Tostada"));
  await noOverflow("/nutrition recientes");
}
log("recientes: lista en «+ Alimento» y alta con la cantidad habitual en un toque");

await browser.close();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("OK v25f");
