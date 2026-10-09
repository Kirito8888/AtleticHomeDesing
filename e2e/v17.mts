// E2E de la v1.7 en un móvil de 390 px (app con ALLOW_REGISTRATION=true y LIFEOS_FAKE_AI=1;
// necesita DATABASE_URL para crear cuentas con `npm run user`).
//   BASE_URL=http://localhost:3000 npm run e2e:v17
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import { chromium } from "playwright-core";

const out = process.env.SHOTS_DIR ?? "e2e/screenshots";
mkdirSync(out, { recursive: true });
const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
// IP propia (X-Forwarded-For, como en security.mjs): las suites anteriores agotan los límites por IP
const IP = { "x-forwarded-for": "198.51.100.170" };
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
const shot = (n: string) => page.screenshot({ path: `${out}/v17-${n}.png`, fullPage: true });
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
const login = async (email: string, pw: string) => {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", extraHTTPHeaders: { "x-forwarded-for": "198.51.100.171" } });
  const p = await c.newPage();
  await p.goto(B + "/login");
  await p.fill("#email", email);
  await p.fill("#password", pw);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login")), p.click("button[type=submit]")]);
  return p;
};

// 1. Cuenta (con la herramienta de administración: el registro por formulario ya lo prueban las otras
// suites y el límite de 5 registros por hora e IP se agotaría en la CI)
const myEmail = `v17${Date.now()}@test.dev`;
const myPw = newUser(myEmail);
await go(B + "/login");
await page.fill("#email", myEmail);
await page.fill("#password", myPw);
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);
log("cuenta e inicio de sesión");

// 2. Seguridad v1.7: cabeceras, llave de acceso (autenticador virtual de Chromium) y auditoría encadenada
const head = await page.request.get(B + "/login");
for (const [h, v] of [["cross-origin-resource-policy", "same-origin"], ["x-permitted-cross-domain-policies", "none"]]) {
  if (head.headers()[h] !== v) errors.push(`cabecera ${h}: ${head.headers()[h]}`);
}
if (head.headers()["x-powered-by"]) errors.push("sigue saliendo X-Powered-By");

const cdp = await ctx.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});
await go(B + "/settings");
await page.getByLabel("Nombre de la llave").fill("Móvil de prueba");
await page.getByRole("button", { name: "Añadir llave" }).click();
await toast(/Llave de acceso añadida/);
await page.getByLabel("Mis llaves de acceso").getByText("Móvil de prueba").waitFor();
await page.getByLabel("Integridad del registro").getByText(/Registro íntegro/).waitFor();
await page.getByText("Llave de acceso añadida").last().waitFor();
await noOverflow("/settings");
await shot("01-passkey");

// Salir y entrar con la llave, sin contraseña
await page.context().clearCookies();
await go(B + "/login");
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 }), page.getByRole("button", { name: "Entrar con llave de acceso" }).click()]);
await go(B + "/settings");
await page.getByText("Inicio de sesión con llave de acceso").first().waitFor();
log("llave de acceso: alta, entrar sin contraseña y registro de auditoría íntegro");


// 3. Privacidad: páginas legales públicas, consentimientos y limitación del tratamiento
const anon = await browser.newContext();
for (const path of ["/legal/privacidad", "/legal/aviso"]) {
  const r = await anon.request.get(B + path, { maxRedirects: 0 });
  if (r.status() !== 200) errors.push(`${path} debería ser pública: ${r.status()}`);
}
if (!(await (await anon.request.get(B + "/legal/privacidad")).text()).includes("Política de privacidad")) errors.push("la política de privacidad no se muestra");
await anon.close();
await go(B + "/settings");
await page.getByRole("switch", { name: "Permitir enviar datos a Google Gemini" }).click();
await toast(/Astras AI activado/);
await go(B + "/settings/privacy");
await page.getByLabel("Consentimientos").getByText(/Astras AI \(Google Gemini\) · concedido/).waitFor();
await page.getByRole("switch", { name: "Limitar el tratamiento de mis datos" }).click();
await toast(/Tratamiento limitado/);
const blocked = await page.request.post(B + "/api/calendar/feed");
if (blocked.status() !== 403) errors.push(`con la limitación activa el enlace .ics debería dar 403 (da ${blocked.status()})`);
await page.getByRole("switch", { name: "Limitar el tratamiento de mis datos" }).click();
await toast(/Limitación levantada/);
await page.getByLabel("Mis peticiones").getByText(/levantada/).waitFor();
await noOverflow("/settings/privacy");
await shot("02-privacy");
log("privacidad: páginas legales, consentimientos con historial y limitación del tratamiento");

// 4. Creador de rutinas con cuestionario y proyección
await go(B + "/training");
await page.getByRole("link", { name: "Crear mi rutina" }).click();
await page.waitForURL(/\/training\/routine$/);
await radio("Soy", "Mujer").click();
await page.getByLabel("Edad").fill("29");
await page.getByLabel("Peso (kg)").fill("62");
await page.getByLabel("Altura (cm)").fill("168");
await radio("Experiencia entrenando", "Nunca he entrenado con regularidad").click();
await radio("Actividad diaria", "Ligera (camino a diario)").click();
await page.getByRole("button", { name: "Siguiente" }).click();
// Salud: con una respuesta marcada no se genera; sin nada, sí
await page.getByRole("button", { name: "No me pasa nada de esto" }).click();
await page.getByRole("button", { name: "Siguiente" }).click();
await page.getByLabel(/Flexiones seguidas/).fill("6");
await page.getByLabel(/Sentadillas en 1 minuto/).fill("24");
await page.getByLabel(/Plancha frontal/).fill("30");
await page.getByRole("button", { name: "Siguiente" }).click();
await radio("Objetivo a corto plazo", "Ganar fuerza").click();
await radio("Objetivo a largo plazo", "Hacer del ejercicio un hábito").click();
await page.getByRole("button", { name: "Siguiente" }).click();
for (const d of ["Lun", "Mié", "Vie"]) await page.getByRole("group", { name: "Días por semana" }).getByRole("checkbox", { name: d }).click();
await radio("Dónde entrenas", "Casa").click();
await page.getByRole("group", { name: "Material que tienes" }).getByRole("checkbox", { name: "Gomas elásticas" }).click();
await page.getByRole("group", { name: "Zonas con molestias" }).getByRole("checkbox", { name: "Rodilla" }).click();
await noOverflow("/training/routine");
await page.getByRole("button", { name: "Crear mi rutina" }).click();
await page.waitForURL(/\/training\/routine\/[a-z0-9]+$/, { timeout: 30_000 });
await page.getByText("Empieza desde cero").first().waitFor();
await page.getByRole("figure", { name: "Proyección: Flexiones seguidas (de rodillas cuentan)" }).waitFor();
await page.getByLabel("Test", { exact: true }).selectOption("pushups");
await page.getByLabel("Resultado").fill("8");
await page.getByRole("button", { name: "Anotar test" }).click();
await toast(/Test anotado/);
await noOverflow("/training/routine/[id]");
await shot("03-routine");
await page.getByRole("link", { name: "Ver y activar la rutina" }).click();
await page.getByText("Rutina del cuestionario").waitFor();
log("creador de rutinas: cuestionario, perfil, rutina en borrador, proyección y retest");

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v17");
