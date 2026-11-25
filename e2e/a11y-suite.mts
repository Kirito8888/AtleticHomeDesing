// v3.0 F · V3-A01: axe (WCAG 2.2 AA) en un recorrido por las 8 verticales a 390 px, en claro, oscuro,
// .hc claro y .hc oscuro. Falla con violaciones serias o críticas no listadas en ALLOWED (cada excepción
// está en docs/auditoria-v3-0.md § Excepciones de F con su bloque destino). Además: sin scroll horizontal,
// controles ≥ 44 px y, con prefers-reduced-motion, sin animaciones en curso.
//   BASE_URL=http://localhost:3000 npm run e2e:a11y
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import { chromium, type Page } from "playwright-core";

import { a11y, smallTargets, WCAG22 } from "./a11y.mjs";

const out = process.env.SHOTS_DIR ?? "e2e/screenshots";
mkdirSync(out, { recursive: true });
const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];

/** Excepciones conocidas: «ruta regla» → bloque destino. Mantener en sincronía con docs/auditoria-v3-0.md. */
const ALLOWED: Record<string, "I" | "T"> = {
  // La barra fija «Guardar sesión» (sticky bottom-20) se superpone en reposo a los chips que quedan debajo; al
  // desplazarse se liberan. El foco por teclado ya no queda tapado (V3-A07, G: scroll-padding + FocusGuard,
  // lo prueba e2e:v30g); quitar el solape pide rediseñar la barra de acción de la sesión: Bloque I.
  "/training/new target-size": "I",
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let ip = 60;
const newPage = async (colorScheme: "light" | "dark", reducedMotion: "reduce" | "no-preference" = "no-preference") => {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, colorScheme, reducedMotion, extraHTTPHeaders: { "x-forwarded-for": `198.51.100.${ip++}` } });
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(`pageerror ${p.url()}: ${e.message}`));
  p.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`);
  });
  return p;
};
const go = async (p: Page, u: string) => {
  await p.goto(B + u, { waitUntil: "load" });
  await p.waitForTimeout(300);
};
const req = async (p: Page, method: "POST" | "PATCH", url: string, data: unknown) => {
  const r = await p.request.fetch(B + url, { method, data });
  if (r.status() >= 400) errors.push(`siembra ${method} ${url}: ${r.status()}`);
};

// Usuaria con datos mínimos en cada vertical (las páginas vacías esconden la mitad de los componentes)
const email = `a11y-${Date.now()}@e2e.test`;
const pw = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", "Atleta A11y", "--role", "ATHLETE", "--accept-terms"], { encoding: "utf8" }).match(/Contraseña: (\S+)/)?.[1];
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
const stamp = Date.now();
const mid = `a11ymod${stamp}`;
psql(`insert into "StudyModule"(id,"userId",name,"updatedAt") values ('${mid}','${uid}','Bioquímica',now())`);
psql(`insert into "StudyTopic"(id,"userId","moduleId",name,tag) values ('a1${stamp}','${uid}','${mid}','Ciclo de Krebs','red'),('a2${stamp}','${uid}','${mid}','Glucólisis','yellow')`);

const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
{
  const p = await newPage("light");
  await login(p);
  for (const [v, d] of [[40, 30], [44, 1]] as const) await req(p, "POST", "/api/training/tests", { test: "cmj", value: v, date: iso(d) });
  await req(p, "POST", "/api/tasks", { title: "Entregar práctica", dueDate: iso(-2) });
  await p.context().close();
}

/** Recorrido: una o varias rutas por vertical. */
const ROUTES: Array<[string, string]> = [
  ["Entreno", "/training"],
  ["Entreno", "/training/new"],
  ["Plan", "/planning"],
  ["Salud", "/recovery"],
  ["Estudio", "/study"],
  ["Estudio", `/study/modules/${mid}/quest`],
  ["Nutrición", "/nutrition"],
  ["Finanzas", "/finance"],
  ["Clubes", "/clubs"],
  ["Ajustes", "/settings"],
];

const THEMES = [
  { name: "claro", scheme: "light", hc: false },
  { name: "oscuro", scheme: "dark", hc: false },
  { name: "hc claro", scheme: "light", hc: true },
  { name: "hc oscuro", scheme: "dark", hc: true },
] as const;

const seen = new Set<string>();
for (const t of THEMES) {
  const p = await newPage(t.scheme);
  await login(p);
  await req(p, "PATCH", "/api/settings/prefs", { highContrast: t.hc });
  for (const [vertical, r] of ROUTES) {
    await go(p, r);
    const where = `${vertical} ${r} (${t.name})`;
    const cls = await p.evaluate(() => document.documentElement.className);
    if (t.hc !== /\bhc\b/.test(cls) || (t.scheme === "dark") !== /\bdark\b/.test(cls)) errors.push(`${where}: tema no aplicado (html.class="${cls}")`);
    for (const v of await a11y(p, where, WCAG22)) {
      const rule = v.slice(where.length + 2).split(" ")[0];
      const key = `${r} ${rule}`;
      if (ALLOWED[key]) seen.add(key);
      else errors.push(v);
    }
    if (await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) errors.push(`${where}: scroll horizontal`);
    const bad = await smallTargets(p);
    if (bad.length) errors.push(`${where}: controles < 44 px: ${bad.join(", ")}`);
  }
  if (t.name === "oscuro" || t.name === "hc claro") await p.screenshot({ path: `${out}/a11y-${t.name.replace(" ", "-")}-planning.png`, fullPage: true });
  log(`${t.name}: ${ROUTES.length} rutas de 8 verticales sin violaciones serias/críticas nuevas`);
  await p.context().close();
}
// Una excepción que no aparece no rompe (algunas dependen de la posición de desplazamiento), pero se avisa
for (const k of Object.keys(ALLOWED)) console.log(seen.has(k) ? `· excepción vigente (${ALLOWED[k]}): ${k}` : `⚠ excepción no vista, ¿resuelta?: ${k}`);

// V3-A04: con movimiento reducido, abrir una hoja no deja animaciones ni transiciones en curso
{
  const p = await newPage("light", "reduce");
  await login(p);
  await go(p, "/training");
  const more = p.getByRole("button", { name: "Más secciones" });
  if (await more.count()) {
    await more.first().tap();
    await p.waitForTimeout(80);
    const running = await p.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && a.effect?.getComputedTiming().iterations !== Infinity).length);
    if (running) errors.push(`movimiento reducido: ${running} animaciones en curso tras abrir la hoja`);
    // Un control con transition-all (botón de la interfaz): su duración debe quedar en ~0
    const dur = await p.evaluate(() => {
      const el = [...document.querySelectorAll("button")].find((b) => getComputedStyle(b).transitionProperty !== "none" && b.className.includes("transition"));
      return el ? parseFloat(getComputedStyle(el).transitionDuration) : -1;
    });
    if (dur < 0) errors.push("movimiento reducido: no hay botón con transición para comprobar");
    else if (dur > 0.001) errors.push(`movimiento reducido: transition-duration de un botón = ${dur}s`);
  } else errors.push("no aparece «Más secciones» para probar el movimiento reducido");
  log("prefers-reduced-motion: sin animaciones en curso");
  await p.context().close();
}

await browser.close();
if (errors.length) {
  console.error(`\n✘ ${errors.length} errores:\n` + errors.map((e) => ` - ${e}`).join("\n"));
  process.exit(1);
}
console.log("\nE2E a11y OK");
