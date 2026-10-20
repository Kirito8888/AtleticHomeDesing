// E2E del bloque «respuesta inmediata, errores en español y uso sin red» en un móvil de 390 px (necesita build de producción y DATABASE_URL).
//   BASE_URL=http://localhost:3000 npm run e2e:v25d
import { execFileSync } from "node:child_process";

import { chromium } from "playwright-core";

import { a11y } from "./a11y.mjs";

const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.175" } });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
const noOverflow = async (where: string) => {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  if (w > 392) errors.push(`${where}: desborda en horizontal (${w}px)`);
};
const minH = async (loc: ReturnType<typeof page.locator>, what: string) => {
  const h = (await loc.boundingBox())?.height ?? 0;
  if (h < 44) errors.push(`${what} mide ${h}px (< 44)`);
};

const email = `v25d${Date.now()}@test.dev`;
const out1 = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", "Amiga", "--role", "ATHLETE", "--accept-terms"], { encoding: "utf8" });
const pw = out1.match(/Contraseña: (\S+)/)?.[1];
if (!pw) throw new Error("no se pudo crear la cuenta");
await page.goto(B + "/login");
await page.fill("#email", email);
await page.fill("#password", pw);
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);

// 1 · Esqueleto al instante: la petición RSC de la sección tarda 2 s y aun así se ve algo en < 400 ms.
await page.route("**/*", async (route) => {
  const r = route.request();
  if (r.headers()["rsc"] === "1" && !r.headers()["next-router-prefetch"] && /\/(training|planning)(\?|$)/.test(r.url())) await new Promise((res) => setTimeout(res, 2000));
  await route.continue();
});
await page.goto(B + "/");
await page.waitForLoadState("networkidle");
for (const [href, name] of [["/training", "Entreno"], ["/planning", "Plan"]] as const) {
  const link = page.locator(`nav[aria-label="Navegación principal"] a[href="${href}"]`).first();
  if (!(await link.count())) continue;
  await link.tap();
  await page.locator('[data-slot="skeleton"]').first().waitFor({ state: "visible", timeout: 400 }).catch(() => errors.push(`${name}: no hay esqueleto en 400 ms`));
  await noOverflow(`esqueleto ${name}`);
  await page.waitForURL(`**${href}`);
  await page.locator('[data-slot="skeleton"]').first().waitFor({ state: "detached", timeout: 8000 }).catch(() => errors.push(`${name}: el esqueleto no desaparece`));
  log(`esqueleto inmediato en ${name}`);
}
await page.unrouteAll({ behavior: "ignoreErrors" });

// 2 · Ruta inexistente en español
await page.goto(B + "/esta-ruta-no-existe");
await page.getByRole("heading", { name: "Página no encontrada" }).waitFor();
if (await page.getByText(/could not be found|404/i).count()) errors.push("404 con texto en inglés");
await minH(page.getByRole("link", { name: "Ir al inicio" }), "«Ir al inicio»");
await noOverflow("404");
errors.push(...(await a11y(page, "404")));
log("404 en español");

// 2b · Los detalles inexistentes siguen devolviendo 404 real (un loading.tsx encima lo dejaría en 200)
for (const p of ["/clubs/inexistente", "/training/inexistente"]) {
  const r = await page.request.get(B + p);
  if (r.status() !== 404) errors.push(`${p} → ${r.status()} (se esperaba 404)`);
}
log("detalles inexistentes: 404");

// 3 · La caché del service worker no guarda salud ni finanzas
await page.goto(B + "/");
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload();
await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 });
for (const p of ["/recovery/health", "/finance", "/recovery"]) {
  await page.goto(B + p);
  await page.waitForLoadState("networkidle");
}
await page.waitForTimeout(800);
const cached = await page.evaluate(async () => {
  const urls: string[] = [];
  for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) urls.push(new URL(r.url).pathname);
  return urls;
});
for (const p of ["/recovery/health", "/finance", "/recovery", "/"]) if (cached.includes(p)) errors.push(`el SW ha guardado ${p}`);
if (!cached.includes("/offline")) errors.push("el SW no tiene /offline");
log("caché del SW sin páginas privadas:", cached.join(", "));

// 4 · Sin red: aviso y reintento
await ctx.setOffline(true);
await page.waitForSelector("text=Sin conexión", { timeout: 5000 }).catch(() => errors.push("sin banner «Sin conexión»"));
await page.getByRole("button", { name: "Más secciones" }).tap();
await page.locator('a[href="/nutrition"]:visible').first().tap();
await page.getByRole("button", { name: "Reintentar" }).first().waitFor({ timeout: 10000 }).catch(() => errors.push("sin red: no sale «Reintentar»"));
if (!(await page.getByText("Sin conexión").count())) errors.push("sin red: no sale «Sin conexión»");
if (await page.getByText(/This page|Application error|Something went wrong/i).count()) errors.push("sin red: error en inglés");
const retry = page.getByRole("button", { name: "Reintentar" }).first();
if (await retry.count()) await minH(retry, "«Reintentar»");
await noOverflow("sin red");
log("sin red: aviso y reintento");
await ctx.setOffline(false);
await page.waitForTimeout(500);
const back = page.waitForEvent("framenavigated", { timeout: 10000 }).catch(() => errors.push("«Reintentar» no recarga"));
await retry.tap().catch(() => undefined);
await back;
await page.waitForLoadState("load");
await page.waitForFunction(() => !document.body.innerText.includes("Reintentar"), null, { timeout: 15000 }).catch(() => errors.push("al volver la red «Reintentar» no recupera la página"));

await browser.close();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("OK v25d");
