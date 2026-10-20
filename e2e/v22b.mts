// E2E de la v2.2 bloque 2 (P2): pista de verdad (PR de tiempo, temporadas, plan IA, bienvenida) y barrido de 390 px
// (sin scroll horizontal en claro y oscuro, objetivos táctiles de 44 px).
//   BASE_URL=http://localhost:3000 npm run e2e:v22b
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import { chromium, type Page } from "playwright-core";

const out = process.env.SHOTS_DIR ?? "e2e/screenshots";
mkdirSync(out, { recursive: true });
const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];
const warnings: string[] = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const newCtx = (ip: string, colorScheme: "light" | "dark" = "light") =>
  browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, colorScheme, extraHTTPHeaders: { "x-forwarded-for": ip } });
const watch = (page: Page) => {
  page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/40[0134]|422|Failed to load resource/.test(m.text())) errors.push(`console ${page.url()}: ${m.text()}`);
  });
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
/** Controles de formulario y botones visibles por debajo de 44 px: aviso (no todos son del sistema de diseño). */
const smallTargets = (p: Page) =>
  p.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("main button:not([role=switch]), main select, main input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]), main [role=tab]")]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.height < 43.5;
      })
      .map((e) => `${e.tagName.toLowerCase()}${e.getAttribute("role") ? `[${e.getAttribute("role")}]` : ""}:${(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 24)}@${Math.round(e.getBoundingClientRect().height)}`),
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

// ---------- A. Velocista: PR de tiempo, temporadas y plan IA ----------
const ctx = await newCtx("198.51.100.220");
const page = await ctx.newPage();
watch(page);
await login(page, "v22vel");
await go(page, "/settings");
await page.locator("#p-event").selectOption("100m");
await page.getByRole("button", { name: "Guardar perfil" }).click();
await page.getByText("Perfil guardado").first().waitFor();

await go(page, "/training/new");
await page.getByRole("button", { name: "Añadir serie" }).click();
await page.getByLabel("Distancia serie 1").fill("100");
await page.getByLabel("Tiempo serie 1").fill("11,5");
await page.getByRole("button", { name: "Repetir serie" }).click();
await page.getByLabel("Tiempo serie 2").fill("11,8");
await page.getByRole("button", { name: "Guardar sesión" }).click();
await page.waitForURL(/\/training\/(?!new)[a-z0-9]+$/);
await page.getByText("8,70 m/s").first().waitFor();
const prs = await page.evaluate(() => fetch("/api/training/records").then((r) => r.text()));
if (!prs.includes("TRACK_TIME")) errors.push(`P2-3: no hay PR TRACK_TIME tras guardar 2×100 m: ${prs.slice(0, 200)}`);
log("P2-3 · la sesión de series crea un PR de tiempo");

await go(page, "/training/seasons");
await page.getByText("Mejor · 100 m").waitFor();
await page.getByText("11,50 s").first().waitFor();
if (await page.getByText("Lanzamientos", { exact: true }).count()) errors.push("P2-6: una velocista ve la fila «Lanzamientos» en temporadas");
await noHScroll(page, "temporadas 390 px");
await page.screenshot({ path: `${out}/v22b-01-temporadas.png`, fullPage: true });
log("P2-6 · temporadas muestra el mejor tiempo de 100 m y oculta lanzamientos");

await go(page, "/study/plan");
const vel = page.getByRole("radiogroup", { name: "Disciplina" }).getByRole("radio", { name: "Velocidad / vallas" });
if ((await vel.getAttribute("aria-checked")) !== "true") errors.push("P2-5: el asistente de plan no preselecciona Velocidad para un 100 m");
await noHScroll(page, "asistente de plan 390 px");
log("P2-5 · el asistente de plan parte de Velocidad / vallas");

// P3-6 · la tira semanal de /training: cada día es un objetivo táctil de al menos 44 × 44 px
await go(page, "/training");
// Se mide cuando los 7 días ya tienen caja: en CI se llegó a leer antes de que la tira se maquetara (0 × 0)
await page.waitForFunction(() => { const l = document.querySelectorAll('section[aria-label="Esta semana"] a'); return l.length === 7 && [...l].every((e) => e.getBoundingClientRect().width > 0); }, null, { timeout: 10_000 }).catch(() => undefined);
const strip = await page.locator('section[aria-label="Esta semana"] a').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
if (strip.length !== 7 || strip.some(([w, h]) => w < 44 || h < 44)) errors.push(`P3-6: tira semanal con objetivos < 44 px: ${JSON.stringify(strip)}`);
await noHScroll(page, "tira semanal 390 px");
log("P3-6 · la tira semanal mide ≥ 44 px por día");

// ---------- B. Bienvenida pide la prueba ----------
const ctx2 = await newCtx("198.51.100.221");
const p2 = await ctx2.newPage();
watch(p2);
await login(p2, "v22wel");
await go(p2, "/welcome");
await p2.getByRole("button", { name: "Siguiente" }).click();
await p2.locator("#wz-event").selectOption("triple");
await noHScroll(p2, "bienvenida 390 px");
await p2.screenshot({ path: `${out}/v22b-02-bienvenida.png`, fullPage: true });
await p2.getByRole("button", { name: "Siguiente" }).click();
await p2.getByRole("button", { name: "Empezar" }).click();
await p2.waitForURL((u) => !u.pathname.startsWith("/welcome"));
const prof = await p2.evaluate(() => fetch("/api/profile").then((r) => r.json()));
if (prof.athleteProfile?.primaryEvent !== "triple" || prof.athleteProfile?.primaryDiscipline !== "JUMPS") errors.push(`P2-9: perfil tras la bienvenida ${JSON.stringify(prof.athleteProfile)}`);
log("P2-9 · la bienvenida guarda la prueba y la disciplina");

// ---------- C. Barrido de 390 px en claro y oscuro ----------
const ROUTES = [
  "/", "/glance", "/goals", "/notifications", "/review", "/search", "/settings", "/settings/privacy", "/settings/trash", "/about", "/safety",
  "/training", "/training/new", "/training/diary", "/training/compare", "/training/equipment", "/training/exercises", "/training/javelin", "/training/performance", "/training/prehab",
  "/training/rm", "/training/routine", "/training/seasons", "/training/tests", "/training/tests/comparar", "/training/tests/curvas", "/training/tests/salto",
  "/recovery", "/recovery/body", "/recovery/fisio", "/recovery/health", "/recovery/trends", "/recovery/wellbeing", "/recovery/women",
  "/planning", "/planning/plan/new", "/planning/week-all",
  "/nutrition", "/nutrition/micros", "/nutrition/plan", "/nutrition/recipes", "/nutrition/shopping", "/nutrition/sweat",
  "/finance", "/finance/trips", "/study", "/study/ask", "/study/assignments", "/study/exam", "/study/exams", "/study/focus", "/study/plan", "/study/schedule",
  "/clubs", "/coach", // /coach/multi es solo para entrenadoras: v20b la recorre
];
const small = new Map<string, number>();
for (const scheme of ["light", "dark"] as const) {
  const c = scheme === "light" ? ctx : await newCtx("198.51.100.222", "dark");
  const pg = scheme === "light" ? page : await c.newPage();
  if (scheme === "dark") {
    watch(pg);
    await login(pg, "v22dark");
  }
  for (const r of ROUTES) {
    await go(pg, r);
    if (new URL(pg.url()).pathname !== r) continue; // redirigida (p. ej. por permisos): no es esta ruta
    await noHScroll(pg, `${r} (${scheme}) 390 px`);
    const s = await smallTargets(pg);
    if (s.length) small.set(r, Math.max(small.get(r) ?? 0, s.length));
    if (process.env.SHOW_SMALL && s.length) console.log(r, s.slice(0, 12).join(" | "));
  }
  log(`barrido ${scheme}: ${ROUTES.length} rutas sin scroll horizontal`);
  if (scheme === "dark") await pg.screenshot({ path: `${out}/v22b-03-oscuro.png`, fullPage: true });
}
if (small.size) warnings.push(`controles < 44 px (ruta: nº): ${[...small].map(([k, v]) => `${k}: ${v}`).join(", ")}`);

await browser.close();
for (const w of warnings) console.warn("⚠", w);
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v22b");
