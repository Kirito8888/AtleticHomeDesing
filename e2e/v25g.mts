// E2E del bloque «menos menú y todo localizable» en un móvil de 390 px (necesita build de producción y DATABASE_URL).
//   BASE_URL=http://localhost:3000 npm run e2e:v25g
import { execFileSync } from "node:child_process";

import { chromium } from "playwright-core";

const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.177" } });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
const noOverflow = async (where: string) => {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  if (w > 392) errors.push(`${where}: desborda en horizontal (${w}px)`);
};
const minH = async (loc: ReturnType<typeof page.locator>, what: string) => {
  const h = (await loc.first().boundingBox())?.height ?? 0;
  if (h < 44) errors.push(`${what} mide ${h}px (< 44)`);
};
const settle = async () => page.waitForLoadState("networkidle");
/** Textos de los enlaces de la barra inferior y del «Más». */
const menu = async () => {
  const bar = await page.locator('nav[aria-label="Navegación principal"] a').allInnerTexts();
  await page.getByRole("button", { name: "Más secciones" }).click();
  const more = await page.locator('[role="dialog"] a').allInnerTexts();
  await page.keyboard.press("Escape");
  return { bar: bar.map((t) => t.trim()), more: more.map((t) => t.trim()) };
};

const email = `v25g${Date.now()}@test.dev`;
const out = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", "Amiga", "--role", "ATHLETE", "--accept-terms"], { encoding: "utf8" });
const pw = out.match(/Contraseña: (\S+)/)?.[1];
if (!pw) throw new Error("no se pudo crear la cuenta");
await page.goto(B + "/login");
await page.fill("#email", email);
await page.fill("#password", pw);
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);

// 1 · Cuenta nueva sin haber hecho la bienvenida: el menú de siempre (no se esconde nada por sorpresa)
await page.goto(B + "/");
await settle();
let m = await menu();
for (const t of ["Plan", "Nutrición", "Finanzas", "Atlenza IA"]) if (!m.more.includes(t)) errors.push(`antes de la bienvenida falta «${t}» en el menú`);
log("sin bienvenida, menú completo");

// 2 · Bienvenida: solo Entreno y Recuperación marcados; el resto se ofrece
await page.goto(B + "/welcome");
await settle();
const group = page.getByRole("group", { name: "Partes de Atlenza" });
const state: Record<string, string | null> = {};
for (const c of await group.getByRole("checkbox").all()) state[(await c.innerText()).trim()] = await c.getAttribute("aria-checked");
const on = Object.entries(state).filter(([, v]) => v === "true").map(([k]) => k).sort();
if (JSON.stringify(on) !== JSON.stringify(["Entreno", "Recuperación"])) errors.push(`módulos marcados por defecto: ${on.join(", ")}`);
if (Object.keys(state).length !== 6) errors.push(`la bienvenida ofrece ${Object.keys(state).length} módulos (esperaba 6)`);
for (const c of await group.getByRole("checkbox").all()) await minH(c, "módulo de la bienvenida");
await noOverflow("bienvenida");
log("bienvenida: Entreno y Recuperación marcados, el resto ofrecido");

await page.getByRole("button", { name: "Siguiente" }).click();
await page.getByRole("button", { name: "Siguiente" }).click();
await Promise.all([page.waitForURL(B + "/"), page.getByRole("button", { name: "Empezar" }).click()]);
await settle();

// 3 · Menú corto a 390 px
m = await menu();
if (m.bar.join("|") !== ["Inicio", "Entreno", "Salud", "Objetivos"].join("|")) errors.push(`barra con cuenta nueva: ${m.bar.join(", ")}`);
for (const t of ["Plan", "Nutrición", "Finanzas", "Atlenza IA"]) if (m.more.includes(t)) errors.push(`«${t}» sigue en el menú de la cuenta nueva`);
for (const t of ["Entreno", "Salud", "Ajustes"]) if (!m.more.includes(t)) errors.push(`falta «${t}» en el menú de la cuenta nueva`);
await noOverflow("inicio con menú corto");
log("menú corto tras la bienvenida:", m.more.join(" · "));

// 4 · Activar el resto desde Ajustes → Módulos
await page.goto(B + "/settings");
await settle();
const nutri = page.getByRole("list", { name: "Módulos" }).getByLabel("Nutrición");
await minH(nutri.locator("xpath=ancestor::label"), "módulo en Ajustes");
await nutri.click();
await page.getByText("Nutrición visible").waitFor({ timeout: 8000 }).catch(() => errors.push("no confirma «Nutrición visible»"));
await page.goto(B + "/");
await settle();
m = await menu();
if (!m.more.includes("Nutrición")) errors.push("Nutrición activada pero no sale en el menú");
log("activar un módulo en Ajustes lo trae de vuelta");

// 5 · Todo localizable: Entreno sola en Ajustes y enlaces a Revisión, De un vistazo y los dos exámenes
await page.goto(B + "/settings");
await settle();
const safety = page.getByRole("link", { name: "Abrir Entreno sola" });
await minH(safety, "Abrir Entreno sola");
await Promise.all([page.waitForURL(/\/safety$/), safety.click()]);
log("Ajustes → Entreno sola");

for (const [from, link, to] of [
  ["/planning", "Revisión semanal", /\/review$/],
  ["/recovery", "Hoy de un vistazo", /\/glance$/],
  ["/glance", "Revisión semanal", /\/review$/],
  ["/review", "Hoy de un vistazo", /\/glance$/],
  ["/study/exam", "Exámenes y notas", /\/study\/exams$/],
  ["/study/exams", "Examen simulado", /\/study\/exam$/],
] as const) {
  await page.goto(B + from);
  await settle();
  const a = page.getByRole("link", { name: link }).last();
  if (!(await a.count())) {
    errors.push(`${from}: falta el enlace «${link}»`);
    continue;
  }
  await minH(a, `${from} → ${link}`);
  await noOverflow(from);
  await Promise.all([page.waitForURL(to), a.click()]).catch(() => errors.push(`${from} → «${link}» no lleva a ${to}`));
}
log("enlaces cruzados sin tocar el menú");

// 6 · Rutas conservadas: ninguna página desaparece
for (const p of ["/safety", "/glance", "/review", "/study/exam", "/study/exams"]) {
  const r = await page.goto(B + p);
  if (!r || r.status() !== 200) errors.push(`${p}: ${r?.status()}`);
}
log("rutas existentes conservadas");

await browser.close();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("OK v25g");
