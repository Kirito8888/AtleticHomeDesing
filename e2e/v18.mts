// E2E de la v1.8 en un móvil de 390 px (app con ALLOW_REGISTRATION=true y LIFEOS_FAKE_AI=1;
// necesita DATABASE_URL para crear cuentas con `npm run user`).
//   BASE_URL=http://localhost:3000 npm run e2e:v18
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import { chromium } from "playwright-core";

import { a11y } from "./a11y.mjs";

const out = process.env.SHOTS_DIR ?? "e2e/screenshots";
mkdirSync(out, { recursive: true });
const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
// IP propia (X-Forwarded-For, como en security.mjs): las suites anteriores agotan los límites por IP
const IP = { "x-forwarded-for": "198.51.100.180" };
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: IP });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
page.on("console", (m) => {
  // ERR_INTERNET_DISCONNECTED: el paso «sin conexión» lo provoca a propósito
  if (m.type() === "error" && !/404|422|ERR_INTERNET_DISCONNECTED/.test(m.text())) errors.push(`console ${page.url()}: ${m.text()}`);
});
page.on("response", (r) => {
  if (r.url().includes("/api/") && r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`);
});
const shot = (n: string) => page.screenshot({ path: `${out}/v18-${n}.png`, fullPage: true });
const go = async (u: string) => {
  await page.goto(u, { waitUntil: "load" });
  await page.waitForTimeout(400);
};
const toast = (re: RegExp) => page.getByText(re).first().waitFor({ timeout: 30_000 });
const noOverflow = async (where: string) => {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  if (w > 392) errors.push(`${where}: desborda en horizontal (${w}px)`);
};
const radio = (group: string, name: string | RegExp) => page.getByRole("radiogroup", { name: group }).getByRole("radio", { name, exact: typeof name === "string" });
const madrid = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
const plusDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const api = async (method: "post" | "put" | "patch" | "delete", url: string, data?: unknown) => {
  const r = await page.request[method](B + url, data === undefined ? undefined : { data });
  if (!r.ok()) errors.push(`${method.toUpperCase()} ${url}: ${r.status()} ${(await r.text()).slice(0, 160)}`);
  return r.ok() ? r.json().catch(() => ({})) : {};
};

const user = (...a: string[]) => execFileSync("npm", ["run", "-s", "user", "--", ...a], { encoding: "utf8" });
const newUser = (email: string, role = "ATHLETE") => {
  const pw = user("create", email, "--name", "Amiga", "--role", role).match(/Contraseña: (\S+)/)?.[1];
  if (!pw) throw new Error(`no se pudo crear ${email}`);
  return pw;
};
// v1.8: la administración exige 2FA o una llave de acceso → llave con autenticador virtual
const addPasskey = async (p: import("playwright-core").Page) => {
  const cdp = await p.context().newCDPSession(p);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await p.goto(B + "/settings");
  await p.getByLabel("Nombre de la llave").fill("Llave de administración");
  await p.getByRole("button", { name: "Añadir llave" }).click();
  await p.getByLabel("Mis llaves de acceso").getByText("Llave de administración").waitFor();
};
const login = async (email: string, pw: string) => {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", extraHTTPHeaders: { "x-forwarded-for": "198.51.100.181" } });
  const p = await c.newPage();
  await p.goto(B + "/login");
  await p.fill("#email", email);
  await p.fill("#password", pw);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login")), p.click("button[type=submit]")]);
  return p;
};

// 1. Cuenta
const myEmail = `v18${Date.now()}@test.dev`;
const myPw = newUser(myEmail);
await go(B + "/login");
await page.fill("#email", myEmail);
await page.fill("#password", myPw);
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);
log("cuenta e inicio de sesión");

// 2. Bloque A · accesibilidad (axe), módulos, letra y contraste, uso local, CSP, administración
const checkA11y = async (where: string) => errors.push(...(await a11y(page, where)));
for (const p of ["/", "/glance", "/training", "/recovery", "/planning", "/nutrition", "/finance", "/study", "/settings"]) {
  await go(B + p);
  await checkA11y(p);
}
await go(B + "/settings#modulos");
await page.getByLabel("Módulos").getByLabel("Finanzas").click();
await toast(/Finanzas oculto/);
await page.reload();
if (await page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Finanzas" }).count()) errors.push("módulo oculto sigue en la barra");
await page.getByLabel("Módulos").getByLabel("Finanzas").click();
await toast(/Finanzas visible/);
await radio("Tamaño de letra", "Grande").click();
await toast(/Guardado/);
await page.waitForFunction(() => document.documentElement.style.fontSize === "115%");
await page.getByLabel(/Contraste alto/).click();
await page.waitForFunction(() => document.documentElement.classList.contains("hc"));
await checkA11y("/settings (contraste alto, letra grande)");
await noOverflow("/settings (letra grande)");
await radio("Tamaño de letra", "Normal").click();
await page.getByLabel(/Contraste alto/).click();
await go(B + "/settings#uso");
await page.getByLabel("Lo que más usas").getByText("/training").waitFor();
const csp = await page.request.post(B + "/api/csp-report", { headers: { "content-type": "application/csp-report" }, data: JSON.stringify({ "csp-report": { "document-uri": B + "/training", "violated-directive": "script-src", "blocked-uri": "https://malo.example/x.js" } }) });
if (csp.status() !== 204) errors.push(`csp-report: ${csp.status()}`);
if ((await page.request.post(B + "/api/admin/integrity")).status() !== 403) errors.push("integridad: un atleta no debe poder");
const adminEmail = `v18admin${Date.now()}@test.dev`;
const admin = await login(adminEmail, newUser(adminEmail, "ADMIN"));
if ((await admin.request.get(B + "/api/admin/status")).status() !== 403) errors.push("admin sin segundo factor no debe ver el estado");
await addPasskey(admin);
await admin.goto(B + "/settings#servidor");
const status = admin.getByLabel("Estado del servidor");
await status.getByText(/Versión del código/).waitFor();
await status.getByLabel("Errores recientes").getByText(/script-src bloqueó https:\/\/malo\.example/).waitFor();
await admin.getByRole("button", { name: "Revisar ahora" }).click();
await admin.getByText(/Todo en orden|ficheros sin registro/).waitFor();
await admin.context().close();
await shot("01-ops");
log("accesibilidad, módulos, letra y contraste, uso local, CSP, administración con segundo factor e integridad");

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v18");
