// E2E de la v2.3 bloque 2: Entrenamiento, Tests (salto) y Métricas a 390 px.
// Sin scroll horizontal, controles ≥ 44 px (error, no aviso), accesos en ≤ 2 toques, pestañas de tests.
//   BASE_URL=http://localhost:3000 npm run e2e:v23b
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import { chromium, type Page } from "playwright-core";

const out = process.env.SHOTS_DIR ?? "e2e/screenshots";
mkdirSync(out, { recursive: true });
const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const newCtx = (ip: string, colorScheme: "light" | "dark" = "light", width = 390) =>
  browser.newContext({ viewport: { width, height: width > 600 ? 900 : 844 }, locale: "es-ES", hasTouch: width < 600, isMobile: width < 600, colorScheme, extraHTTPHeaders: { "x-forwarded-for": ip } });
const watch = (page: Page) => {
  page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
  page.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`);
  });
};
const go = async (p: Page, u: string) => {
  await p.goto(B + u, { waitUntil: "load" });
  await p.waitForTimeout(300);
};
const noHScroll = async (p: Page, where: string) => {
  if (await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) errors.push(`scroll horizontal en ${where}`);
};
/** Controles táctiles visibles de <main> por debajo de 44 px (casillas y radios los cubre su <label>). */
const small = (p: Page) =>
  p.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("main a, main button:not([role=switch]), main select, main summary, main input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]), main [role=tab]")]
      .filter((e) => {
        if (e.closest("p, li > p") && e.tagName === "A" && e.closest("p")) return false; // enlaces en línea dentro de texto
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.height < 43.5;
      })
      .map((e) => `${e.tagName.toLowerCase()}:${(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 24)}@${Math.round(e.getBoundingClientRect().height)}`),
  );
async function login(page: Page, tag: string) {
  const email = `${tag}-${Date.now()}@e2e.test`;
  const created = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", `Atleta ${tag}`, "--role", "ATHLETE", "--accept-terms"], { encoding: "utf8" });
  const pw = created.match(/Contraseña: (\S+)/)?.[1];
  if (!pw) throw new Error("no se pudo crear el usuario");
  await go(page, "/login");
  await page.fill("#email", email);
  await page.fill("#password", pw);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);
}
const post = (p: Page, url: string, body: unknown) =>
  p.evaluate(([u, b]) => fetch(u as string, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.status), [url, body] as const);
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);

for (const scheme of ["light", "dark"] as const) {
  const ctx = await newCtx(scheme === "light" ? "198.51.100.241" : "198.51.100.242", scheme);
  const page = await ctx.newPage();
  watch(page);
  await login(page, `v23b${scheme[0]}`);

  // Datos: dos resultados de test y una sesión
  for (const [v, d] of [[40, 60], [47, 1]] as const) if ((await post(page, "/api/training/tests", { test: "cmj", value: v, date: iso(d) })) >= 400) errors.push("no se pudo sembrar el test");
  await go(page, "/settings");
  await page.locator("#p-event").selectOption("100m");
  await page.getByRole("button", { name: "Guardar perfil" }).click();
  await page.getByText("Perfil guardado").first().waitFor();
  await go(page, "/training/new");
  await page.getByRole("button", { name: "Añadir serie" }).click();
  await page.getByLabel("Distancia serie 1").fill("100");
  await page.getByLabel("Tiempo serie 1").fill("12,5");
  await page.getByRole("button", { name: "Guardar sesión" }).click();
  await page.waitForURL(/\/training\/(?!new)[a-z0-9]+$/);
  const sessionPath = new URL(page.url()).pathname;

  for (const r of ["/training", "/training/new", sessionPath, "/training/tests", "/training/tests/salto", "/training/tests/comparar", "/training/tests/curvas", "/training/performance", "/training/performance?days=30"]) {
    await go(page, r);
    await noHScroll(page, `${r} (${scheme})`);
    const bad = await small(page);
    if (bad.length) errors.push(`${r} (${scheme}): controles < 44 px: ${bad.join(", ")}`);
  }
  log(`${scheme}: sin scroll horizontal y controles ≥ 44 px`);

  // Accesos en ≤ 2 toques desde /training
  await go(page, "/training");
  if ((await page.getByRole("button", { name: "Más secciones" }).count()) === 0) errors.push("falta la barra inferior");
  await page.getByRole("navigation", { name: "Accesos de entrenamiento" }).getByRole("link", { name: "Medir salto" }).tap();
  await page.waitForURL("**/training/tests/salto");
  const tabs = page.getByRole("navigation", { name: "Secciones de tests" });
  await tabs.waitFor();
  if ((await tabs.locator("a[aria-current=page]").count()) !== 1) errors.push("pestañas de tests: debe haber una activa");
  if (!(await tabs.getByRole("link", { name: "Medir salto" }).getAttribute("aria-current"))) errors.push("la pestaña activa no es «Medir salto»");
  await tabs.getByRole("link", { name: "Resultados" }).tap();
  await page.waitForURL("**/training/tests");
  await page.getByText("Último:").first().waitFor();
  if (scheme === "light") await page.screenshot({ path: `${out}/v23b-02-tests.png`, fullPage: true });

  await go(page, "/training");
  await page.getByRole("navigation", { name: "Accesos de entrenamiento" }).getByRole("link", { name: "Rendimiento" }).tap();
  await page.waitForURL("**/training/performance**");
  // Índice de secciones: ancla a Fuerza
  await page.getByRole("navigation", { name: "Ir a una sección" }).getByRole("link", { name: "Fuerza" }).tap();
  if (!(await page.locator("#fuerza").count())) errors.push("falta la sección #fuerza");
  if (scheme === "light") {
    await go(page, "/training");
    await page.screenshot({ path: `${out}/v23b-01-training.png`, fullPage: true });
  }
  // La biblioteca plegada se abre y sus enlaces miden ≥ 44 px
  await go(page, "/training");
  await page.locator("details", { hasText: "Planificar y biblioteca" }).locator("summary").tap();
  const hs = await page.locator("details[open] a").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  if (!hs.length || hs.some((h) => h < 44)) errors.push(`enlaces de «Planificar y biblioteca» < 44 px (${hs})`);
  await noHScroll(page, `/training con accesos abiertos (${scheme})`);
  await ctx.close();
  log(`${scheme}: accesos, pestañas e índice de métricas`);
}

// Desktop: formulario de tests a la izquierda, sin scroll
{
  const ctx = await newCtx("198.51.100.243", "light", 1280);
  const page = await ctx.newPage();
  watch(page);
  await login(page, "v23bdk");
  await go(page, "/training/tests");
  await noHScroll(page, "tests (desktop)");
  const form = await page.getByText("Nuevo resultado", { exact: true }).boundingBox();
  if (!form || form.x > 400) errors.push("desktop: el formulario de tests no está a la izquierda");
  await ctx.close();
  log("desktop: tests con formulario a la izquierda");
}

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v23b");
