// E2E de la v2.3 bloque 1: navegación global unificada (barra inferior con «Más», barra lateral agrupada).
// 390 px sin scroll horizontal, destinos ≥ 44 px, accesos clave en ≤ 2 toques, visibilidad por rol.
//   BASE_URL=http://localhost:3000 npm run e2e:v23a
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
  await p.waitForTimeout(250);
};
const noHScroll = async (p: Page, where: string) => {
  if (await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) errors.push(`scroll horizontal en ${where}`);
};
async function login(page: Page, tag: string, role: "ATHLETE" | "COACH") {
  const email = `${tag}-${Date.now()}@e2e.test`;
  const created = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", `Nav ${tag}`, "--role", role, "--accept-terms"], { encoding: "utf8" });
  const pw = created.match(/Contraseña: (\S+)/)?.[1];
  if (!pw) throw new Error("no se pudo crear el usuario");
  await go(page, "/login");
  await page.fill("#email", email);
  await page.fill("#password", pw);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);
}
const bar = (p: Page) => p.getByRole("navigation", { name: "Navegación principal" });
/** Abre «Más» y sigue el enlace: 2 toques desde cualquier pantalla. */
async function viaMore(p: Page, name: string | RegExp) {
  await bar(p).getByRole("button", { name: "Más secciones" }).tap();
  const sheet = p.getByRole("dialog");
  await sheet.getByRole("link", { name }).tap();
}

for (const [role, ip, tag] of [["ATHLETE", "198.51.100.231", "v23at"], ["COACH", "198.51.100.232", "v23co"]] as const) {
  for (const scheme of ["light", "dark"] as const) {
    const ctx = await newCtx(ip + (scheme === "dark" ? "0" : ""), scheme);
    const page = await ctx.newPage();
    watch(page);
    await login(page, `${tag}${scheme[0]}`, role);

    // Barra: 5 huecos (Inicio, 3 destinos, Más), todos ≥ 44 px
    const items = bar(page).locator("a, button");
    if ((await items.count()) !== 5) errors.push(`${role}/${scheme}: la barra no tiene 5 huecos`);
    const heights = await items.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    if (heights.some((h) => h < 44)) errors.push(`${role}/${scheme}: hueco de la barra < 44 px (${heights})`);
    if (await page.getByRole("button", { name: "Menú", exact: true }).count()) errors.push("sigue la hamburguesa antigua");

    for (const r of ["/", "/training", "/recovery", "/clubs", "/settings", "/settings/privacy"]) {
      await go(page, r);
      await noHScroll(page, `${r} (${role}/${scheme})`);
    }

    // Accesos clave en ≤ 2 toques
    await go(page, "/");
    await bar(page).getByRole("link", { name: "Entreno" }).tap();
    await page.waitForURL("**/training");
    await bar(page).getByRole("link", { name: "Salud" }).tap();
    await page.waitForURL("**/recovery");
    for (const [name, path] of [[/^Clubes$/, "/clubs"], [/^Ajustes$/, "/settings"], [/^Privacidad$/, "/settings/privacy"]] as const) {
      await go(page, "/");
      await viaMore(page, name);
      await page.waitForURL("**" + path);
    }
    // «Más» se marca fuera de la barra; Privacidad no marca también Ajustes
    if ((await bar(page).getByRole("button", { name: "Más secciones" }).getAttribute("aria-current")) !== "page") errors.push("«Más» no marcado en /settings/privacy");
    await bar(page).getByRole("button", { name: "Más secciones" }).tap();
    const sheet = page.getByRole("dialog");
    await noHScroll(page, `sheet abierto (${role}/${scheme})`);
    if ((await sheet.locator("a[aria-current=page]").count()) !== 1) errors.push("el sheet debe marcar una sola entrada activa");
    const lh = await sheet.getByRole("link").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    if (lh.some((h) => h < 44)) errors.push(`enlace del sheet < 44 px (${lh})`);

    // Rol: «Mis atletas» solo para la entrenadora; Administración nunca aquí
    const coachLinks = await sheet.getByRole("link", { name: "Mis atletas" }).count();
    if (role === "ATHLETE" && coachLinks) errors.push("la atleta ve «Mis atletas»");
    if (role === "COACH" && !coachLinks) errors.push("la entrenadora no ve «Mis atletas»");
    if (await sheet.getByRole("link", { name: "Administración" }).count()) errors.push(`${role} ve Administración`);
    if (scheme === "light" && role === "COACH") await page.screenshot({ path: `${out}/v23a-01-mas.png` });
    if (role === "COACH" && scheme === "light") {
      await sheet.getByRole("link", { name: "Mis atletas" }).tap();
      await page.waitForURL("**/coach");
    }
    await ctx.close();
    log(`${role}/${scheme}: barra, ≤ 2 toques, sin scroll horizontal`);
  }
}

// Desktop: barra lateral con los grupos
{
  const ctx = await newCtx("198.51.100.233", "light", 1280);
  const page = await ctx.newPage();
  watch(page);
  await login(page, "v23dk", "COACH");
  const side = page.getByRole("complementary");
  for (const g of ["Entrenamiento y salud", "Clubes y coach", "Herramientas", "Configuración"]) {
    if (!(await side.getByRole("heading", { name: g }).count())) errors.push(`sidebar sin grupo «${g}»`);
  }
  if (await bar(page).isVisible()) errors.push("la barra inferior se ve en desktop");
  await go(page, "/settings/privacy");
  if ((await side.locator("a[aria-current=page]").count()) !== 1) errors.push("sidebar: más de una entrada activa en /settings/privacy");
  await noHScroll(page, "desktop");
  await ctx.close();
  log("desktop: barra lateral agrupada");
}

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v23a");
