// E2E de la v2.0 bloque A (clubes y cuotas internas) en un móvil de 390 px
// (app con ALLOW_REGISTRATION=true; necesita DATABASE_URL para crear cuentas con `npm run user`).
//   BASE_URL=http://localhost:3000 npm run e2e:v20a
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import { chromium, type Page } from "playwright-core";

import { a11y } from "./a11y.mjs";

const out = process.env.SHOTS_DIR ?? "e2e/screenshots";
mkdirSync(out, { recursive: true });
const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let ipSeq = 230;
const newPage = async () => {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": `198.51.100.${ipSeq++}` } });
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(`pageerror ${p.url()}: ${e.message}`));
  p.on("console", (m) => {
    if (m.type() === "error" && !/40[0134]|422/.test(m.text())) errors.push(`console ${p.url()}: ${m.text()}`);
  });
  p.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`);
  });
  return p;
};
const go = async (p: Page, u: string) => {
  await p.goto(B + u, { waitUntil: "load" });
  await p.waitForTimeout(300);
};
const checkA11y = async (p: Page, where: string) => errors.push(...(await a11y(p, where)));
const shot = (p: Page, n: string) => p.screenshot({ path: `${out}/v20a-${n}.png`, fullPage: true });
const noHScroll = async (p: Page, where: string) => {
  if (await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) errors.push(`scroll horizontal en ${where}`);
};

const user = (...a: string[]) => execFileSync("npm", ["run", "-s", "user", "--", ...a], { encoding: "utf8" });
const newUser = (email: string, name: string, role: string) => {
  const pw = user("create", email, "--name", name, "--role", role, "--accept-terms").match(/Contraseña: (\S+)/)?.[1];
  if (!pw) throw new Error(`no se pudo crear ${email}`);
  return pw;
};
const login = async (p: Page, email: string, pw: string) => {
  await go(p, "/login");
  await p.fill("#email", email);
  await p.fill("#password", pw);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login")), p.click("button[type=submit]")]);
};

const run = Date.now();
const mail = (k: string) => `${k}-${run}@e2e.test`;
const pw = { adm: newUser(mail("adm"), "Directora", "COACH"), coa: newUser(mail("coa"), "Entrenadora", "COACH"), at1: newUser(mail("at1"), "Atleta Uno", "ATHLETE"), at2: newUser(mail("at2"), "Atleta Dos", "ATHLETE") };

// 1. La directora crea el club e invita a la entrenadora y a dos atletas
const adm = await newPage();
await login(adm, mail("adm"), pw.adm);
await go(adm, "/clubs");
await adm.locator("details", { hasText: "Crear un club" }).locator("summary").click();
await adm.getByLabel("Nombre del club").fill("Club E2E");
await adm.getByRole("button", { name: "Crear club" }).click();
await adm.getByRole("link", { name: /Club E2E/ }).click();
await adm.waitForURL(/\/clubs\/[^/]+$/);
const clubUrl = new URL(adm.url()).pathname;
await adm.locator("details", { hasText: "Invitar a una persona" }).locator("summary").click();
for (const [k, role] of [["coa", "COACH"], ["at1", "ATHLETE"], ["at2", "ATHLETE"]] as const) {
  await adm.getByLabel("Email de la persona").fill(mail(k));
  await adm.getByLabel("Rol").selectOption(role);
  await adm.getByRole("button", { name: "Invitar" }).click();
  await adm.getByText(k === "coa" ? "Entrenadora" : k === "at1" ? "Atleta Uno" : "Atleta Dos").first().waitFor();
}
log("club creado y tres invitaciones enviadas");

// 2. Aceptan: las atletas eligen qué ve el staff; la 2.ª no deja ver recuperación
const accept = async (k: "coa" | "at1" | "at2", uncheck?: string) => {
  const p = await newPage();
  await login(p, mail(k), pw[k]);
  await go(p, "/clubs");
  await p.getByText("te invita como").waitFor();
  if (k === "at1") await checkA11y(p, "/clubs (invitación)");
  if (uncheck) await p.getByLabel(uncheck).uncheck();
  await p.getByRole("button", { name: "Aceptar" }).click();
  await p.getByRole("link", { name: /Club E2E/ }).waitFor();
  return p;
};
const coa = await accept("coa");
const at1 = await accept("at1");
const at2 = await accept("at2", "Recuperación y lesiones");
await shot(at1, "01-invitacion-aceptada");
log("las tres aceptan; el consentimiento de las atletas es suyo");

// 3. Una sesión planificada de la atleta 1 (vía API con su sesión)
const day = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
const r = await at1.evaluate(
  async (d) => (await fetch("/api/training/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ date: d, type: "MIXED", status: "PLANNED", title: "Series 6x60" }) })).status,
  day,
);
if (r >= 300) errors.push(`no se pudo crear la sesión planificada: HTTP ${r}`);

// 4. Panel de la entrenadora: miembros, cumplimiento, alertas, calendario; sin cuotas
await go(coa, clubUrl);
await coa.getByRole("heading", { name: /Miembros/ }).waitFor();
await coa.getByRole("list", { name: "Cumplimiento del club (móvil)" }).waitFor();
await coa.getByRole("heading", { name: "Alertas de grupo" }).waitFor();
await coa.getByText("Series 6x60").waitFor();
if ((await coa.getByRole("heading", { name: "Cuotas" }).count()) !== 0) errors.push("la entrenadora ve el bloque de cuotas");
await noHScroll(coa, "panel entrenadora 390 px");
await checkA11y(coa, "panel del club (entrenadora)");
await shot(coa, "02-panel-entrenadora");
// La entrenadora no accede a /clubs/{otro}
const nf = await coa.goto(B + "/clubs/inexistente");
if (nf?.status() !== 404) errors.push(`/clubs/inexistente → ${nf?.status()}`);
log("panel de la entrenadora: miembros, cumplimiento, alertas y calendario colectivo; sin cuotas");

// 5. La directora apunta una cuota y la marca pagada
await go(adm, clubUrl);
await adm.locator("details", { hasText: "Apuntar una cuota" }).locator("summary").click();
await adm.getByLabel("Atleta de la cuota").selectOption({ label: "Atleta Uno" });
await adm.getByLabel("Concepto").fill("Cuota octubre");
await adm.getByLabel("Importe (€)").fill("30,50");
await adm.getByRole("button", { name: "Apuntar cuota" }).click();
await adm.getByText(/30,50\s€ · vence/).waitFor();
await adm.getByText(/Pendiente 30,50/).waitFor();
await adm.getByRole("button", { name: /Marcar pagada: Cuota octubre/ }).click();
await adm.getByText(/Pagado 30,50/).waitFor();
await noHScroll(adm, "panel directora 390 px");
await checkA11y(adm, "panel del club (directora, cuotas)");
await shot(adm, "03-cuotas");
log("cuota apuntada y marcada como pagada");

// 6. La atleta ve solo su cuota; la otra atleta no ve ninguna
await go(at1, clubUrl);
await at1.getByText(/Cuota octubre/).waitFor();
await noHScroll(at1, "vista atleta 390 px");
await go(at2, clubUrl);
await at2.getByText("Sin cuotas apuntadas.").waitFor();
log("cada atleta solo ve sus cuotas");

// 7. Escritorio: el panel no se rompe
await adm.setViewportSize({ width: 1280, height: 800 });
await go(adm, clubUrl);
await adm.getByRole("table", { name: "Cumplimiento del club" }).waitFor();
await shot(adm, "04-escritorio");

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v20a");
