// v3.0 G · Navegación por intención, barra móvil configurable (V3-D01), Estudio (V3-D02) y foco por teclado
// nunca tapado (V3-A07), a 390 px. Necesita build de producción y DATABASE_URL.
//   BASE_URL=http://localhost:3000 npm run e2e:v30g
import { execFileSync } from "node:child_process";

import { chromium, type Browser, type Page } from "playwright-core";

const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];

const browser: Browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let ip = 40;
const newPage = async (touch = true) => {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: touch, isMobile: touch, extraHTTPHeaders: { "x-forwarded-for": `198.51.100.${ip++}` } });
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(`pageerror ${p.url()}: ${e.message}`));
  p.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`);
  });
  return p;
};
const go = async (p: Page, u: string) => {
  await p.goto(B + u, { waitUntil: "load" });
  await p.waitForLoadState("networkidle").catch(() => {});
};

const email = `v30g-${Date.now()}@e2e.test`;
const pw = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", "Atleta G", "--role", "ATHLETE", "--accept-terms"], { encoding: "utf8" }).match(/Contraseña: (\S+)/)?.[1];
if (!pw) throw new Error("no se pudo crear la cuenta");
const login = async (p: Page) => {
  await go(p, "/login");
  await p.fill("#email", email);
  await p.fill("#password", pw);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login")), p.click("button[type=submit]")]);
};
const dbUrl = (process.env.DATABASE_URL ?? "").replace(/\?.*/, "");
const psql = (sql: string) => execFileSync("psql", [dbUrl, "-Atqc", sql], { encoding: "utf8" }).trim();
const uid = psql(`select id from "User" where email='${email}'`);

const barNav = (p: Page) => p.getByRole("navigation", { name: "Navegación principal" });
const barHrefs = async (p: Page) => barNav(p).locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
const expectBar = async (p: Page, want: string[], what: string) => {
  const got = await barHrefs(p);
  if (got.join() !== want.join()) errors.push(`${what}: barra ${got.join(" ")} (esperada ${want.join(" ")})`);
};

const page = await newPage();
await login(page);

// 1 · Cuenta nueva sin uso: la barra de siempre; «Atlenza IA» ya no existe y Estudio está en el menú
await go(page, "/");
await expectBar(page, ["/", "/training", "/planning", "/recovery"], "cuenta nueva");
await barNav(page).getByRole("button", { name: "Más secciones" }).tap();
const more = (await page.locator('[role="dialog"] a').allInnerTexts()).map((t) => t.trim());
if (more.some((t) => /Atlenza IA/.test(t))) errors.push("«Atlenza IA» sigue en el menú");
if (!more.includes("Estudio")) errors.push("falta Estudio en el menú");
for (const g of ["Entrenar", "Cuidarme", "Organizarme", "Con otras personas", "Configuración"])
  if (!(await page.locator('[role="dialog"]').getByRole("heading", { name: g }).count())) errors.push(`«Más» sin el grupo «${g}»`);
await page.keyboard.press("Escape");
log("menú por intención y Estudio en lugar de «Atlenza IA»");

// 2 · Uso de Estudio y Finanzas (lo que dejaría UsageBeacon) → la barra los sugiere: 1 toque
psql(
  `insert into "PageUsage" ("userId", path, week, count) values ('${uid}', '/study', date_trunc('week', now())::date, 25), ('${uid}', '/finance', date_trunc('week', now())::date, 18), ('${uid}', '/study/schedule', (date_trunc('week', now()) - interval '7 days')::date, 6) on conflict ("userId", path, week) do update set count = excluded.count`,
);
await go(page, "/");
await expectBar(page, ["/", "/training", "/study", "/finance"], "barra sugerida por el uso");
await barNav(page).getByRole("link", { name: "Estudio" }).tap();
await page.waitForURL(/\/study$/);
await page.getByRole("heading", { level: 1, name: "Estudio" }).waitFor();
await barNav(page).getByRole("link", { name: "Finanzas" }).tap();
await page.waitForURL(/\/finance$/);
log("Estudio y Finanzas a 1 toque si se usan");

// 3 · Ajustes → barra: elegirla, guardarla y que se restaure (recarga y otro dispositivo); volver a la sugerida
await go(page, "/settings#barra");
const slot = (i: number) => page.getByLabel(`Hueco ${i}`);
if (!(await page.getByText(/Sugerida por tu uso: Entreno, Estudio, Finanzas/).count())) errors.push("Ajustes no muestra la barra sugerida");
await slot(1).selectOption("/nutrition");
await slot(2).selectOption("/nutrition");
await page.getByRole("alert").filter({ hasText: "destino repetido" }).waitFor();
if (!(await page.getByRole("button", { name: "Guardar barra" }).isDisabled())) errors.push("deja guardar destinos repetidos");
await slot(2).selectOption("/goals");
await slot(3).selectOption("/clubs");
await page.getByRole("button", { name: "Guardar barra" }).click();
await page.getByText("Barra guardada").first().waitFor();
await page.waitForLoadState("networkidle");
await go(page, "/");
await expectBar(page, ["/", "/nutrition", "/goals", "/clubs"], "barra elegida tras recargar");
const stored = psql(`select prefs->'mobileBar' from "AthleteProfile" where "userId"='${uid}'`);
if (stored.replace(/\s/g, "") !== '["/nutrition","/goals","/clubs"]') errors.push(`prefs.mobileBar guardado: ${stored}`);
const other = await newPage();
await login(other);
await go(other, "/");
await expectBar(other, ["/", "/nutrition", "/goals", "/clubs"], "barra elegida en otro dispositivo");
await other.context().close();
await go(page, "/settings#barra");
await page.getByRole("button", { name: "Volver a la sugerida por el uso" }).click();
await page.getByText("Barra sugerida por el uso").first().waitFor();
await page.waitForLoadState("networkidle");
await go(page, "/");
await expectBar(page, ["/", "/training", "/study", "/finance"], "vuelta a la sugerida");
if (psql(`select prefs->'mobileBar' from "AthleteProfile" where "userId"='${uid}'`) !== "null") errors.push("mobileBar no vuelve a null");
// un módulo oculto sale de la barra y entra el siguiente
await page.request.patch(B + "/api/settings/prefs", { data: { hiddenModules: ["finance"] } });
await go(page, "/");
await expectBar(page, ["/", "/training", "/planning", "/study"], "con Finanzas oculto");
await page.request.patch(B + "/api/settings/prefs", { data: { hiddenModules: [] } });
log("barra guardada en prefs, restaurada y vuelta a la sugerida");

// 4 · Teclado (sin táctil): el foco siempre visible y nunca tapado por la cabecera, la barra inferior ni una barra fija
const kb = await newPage(false);
await login(kb);
/** Estado del elemento enfocado: visible (contorno o anillo) y no tapado por una barra que no lo contiene. */
const focusState = (p: Page) =>
  p.evaluate(() => {
    const el = document.activeElement as HTMLElement | SVGElement | null;
    if (!el || el === document.body || el.id === "main") return null;
    const cs = getComputedStyle(el);
    // SVG (mapa corporal): el foco se marca engrosando el trazo de sus zonas con --ring
    const svgRing = el instanceof SVGElement && [...el.querySelectorAll("path")].some((x) => parseFloat(getComputedStyle(x).strokeWidth) >= 2);
    const ring = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== "none") || svgRing;
    let fixed = false;
    for (let a: Element | null = el; a; a = a.parentElement) if (["fixed", "sticky"].includes(getComputedStyle(a).position)) fixed = true;
    const r = el.getBoundingClientRect();
    const name = `${el.tagName.toLowerCase()} «${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)}»`;
    if (fixed || r.height === 0) return { name, ring, covered: null as string | null };
    const vh = innerHeight;
    let covered: string | null = null;
    for (const b of document.querySelectorAll<HTMLElement>('header.sticky, nav[aria-label="Navegación principal"], [data-sticky-action]')) {
      if (b.contains(el) || getComputedStyle(b).display === "none") continue;
      const br = b.getBoundingClientRect();
      if (b.hasAttribute("data-sticky-action") && br.bottom < vh - 120) continue;
      const overlap = Math.min(r.bottom, br.bottom) - Math.max(r.top, br.top);
      if (overlap > 2 && Math.min(r.right, br.right) > Math.max(r.left, br.left)) covered = b.getAttribute("aria-label") ?? b.tagName.toLowerCase();
    }
    return { name, ring, covered };
  });
const routes = ["/", "/training", "/training/new", "/planning", "/study", "/finance", "/settings"];
let checked = 0;
for (const r of routes) {
  await go(kb, r);
  await kb.locator("body").click({ position: { x: 5, y: 300 } });
  for (let i = 0; i < 35; i++) {
    await kb.keyboard.press("Tab");
    const s = await focusState(kb);
    if (!s) continue;
    checked++;
    if (!s.ring) errors.push(`${r}: foco sin contorno visible en ${s.name}`);
    if (s.covered) errors.push(`${r}: foco en ${s.name} tapado por ${s.covered}`);
  }
}
// Hoja «Más» por teclado: se abre con Enter, el foco queda dentro y visible, Escape la cierra
await go(kb, "/");
await barNav(kb).getByRole("button", { name: "Más secciones" }).focus();
await kb.keyboard.press("Enter");
await kb.locator('[role="dialog"]').waitFor();
for (let i = 0; i < 14; i++) {
  await kb.keyboard.press("Tab");
  const inside = await kb.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
  if (!inside) errors.push("el foco sale de la hoja «Más»");
  const s = await focusState(kb);
  if (s && !s.ring) errors.push(`hoja «Más»: foco sin contorno en ${s.name}`);
}
await kb.keyboard.press("Escape");
await kb.locator('[role="dialog"]').waitFor({ state: "detached" });
if (checked < 100) errors.push(`solo se comprobaron ${checked} focos`);
log(`teclado: ${checked} focos en ${routes.length} pantallas + hoja «Más», visibles y sin tapar`);

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + [...new Set(errors)].join("\n"));
  process.exit(1);
}
console.log("✔ e2e:v30g OK");
