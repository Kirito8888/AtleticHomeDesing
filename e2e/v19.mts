// E2E de la v1.9 en un móvil de 390 px (app con ALLOW_REGISTRATION=true y LIFEOS_FAKE_AI=1;
// necesita DATABASE_URL para crear cuentas con `npm run user`).
//   BASE_URL=http://localhost:3000 npm run e2e:v19
// El registro con invitación y el registro cerrado se prueban en security.mjs (con ALLOW_REGISTRATION=false).
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
let ipSeq = 190;
const newPage = async () => {
  // IP propia por contexto (X-Forwarded-For): las suites anteriores agotan los límites por IP
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
const shot = (p: Page, n: string) => p.screenshot({ path: `${out}/v19-${n}.png`, fullPage: true });

const user = (...a: string[]) => execFileSync("npm", ["run", "-s", "user", "--", ...a], { encoding: "utf8" });
const newUser = (email: string, role = "ATHLETE", terms = true) => {
  const pw = user("create", email, "--name", "Amiga", "--role", role, ...(terms ? ["--accept-terms"] : [])).match(/Contraseña: (\S+)/)?.[1];
  if (!pw) throw new Error(`no se pudo crear ${email}`);
  return pw;
};
const login = async (p: Page, email: string, pw: string) => {
  await go(p, "/login");
  await p.fill("#email", email);
  await p.fill("#password", pw);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login")), p.click("button[type=submit]")]);
};
// La administración exige 2FA o una llave de acceso → llave con autenticador virtual
const addPasskey = async (p: Page) => {
  const cdp = await p.context().newCDPSession(p);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await go(p, "/settings");
  await p.getByLabel("Nombre de la llave").fill("Llave de administración");
  await p.getByRole("button", { name: "Añadir llave" }).click();
  await p.getByLabel("Mis llaves de acceso").getByText("Llave de administración").waitFor();
};
const run = Date.now();

// 1. Páginas públicas nuevas: condiciones, acerca de y enlace de contraseña no válido (axe)
{
  const p = await newPage();
  await go(p, "/legal/condiciones");
  await p.getByRole("heading", { name: /Condiciones de uso/ }).first().waitFor();
  await checkA11y(p, "/legal/condiciones");
  await go(p, "/reset?token=no-vale");
  await p.getByText("Enlace no válido").waitFor();
  await checkA11y(p, "/reset");
  await go(p, "/login");
  await p.getByText("¿Olvidaste la contraseña?").click();
  await p.getByText(/administración/).first().waitFor();
  await go(p, "/register");
  // Sin marcar las condiciones el navegador no deja enviar (required) y la acción también lo exige
  if (!(await p.locator("input[name=terms]").evaluate((e) => (e as HTMLInputElement).required))) errors.push("la casilla de condiciones no es obligatoria");
  await p.context().close();
  log("condiciones, enlace no válido, ayuda de contraseña y casilla obligatoria en el registro");
}

// 2. Cuenta creada sin aceptar las condiciones → pantalla de condiciones antes de usar la app
const athleteEmail = `v19${run}@test.dev`;
const athletePw = newUser(athleteEmail, "ATHLETE", false);
const athlete = await newPage();
await login(athlete, athleteEmail, athletePw);
await athlete.getByRole("heading", { name: "Condiciones de uso de Atlenza" }).waitFor();
await checkA11y(athlete, "pantalla de condiciones");
if (await athlete.getByRole("navigation", { name: "Navegación principal" }).count()) errors.push("sin aceptar las condiciones se ve la navegación");
if (!(await athlete.getByRole("button", { name: "Aceptar y continuar" }).isDisabled())) errors.push("se pueden aceptar sin marcar la casilla");
await athlete.getByLabel(/He leído y acepto/).check();
await athlete.getByRole("button", { name: "Aceptar y continuar" }).click();
await athlete.getByRole("navigation", { name: "Navegación principal" }).first().waitFor();
await go(athlete, "/about");
await athlete.getByText("David Ornelas Luna").first().waitFor();
await athlete.getByText(/Open Food Facts/).first().waitFor();
await checkA11y(athlete, "/about");
if ((await athlete.request.get(B + "/api/admin/users")).status() !== 403) errors.push("un atleta no debe ver la lista de cuentas");
if ((await athlete.request.post(B + "/api/admin/invitations", { data: { email: null } })).status() !== 403) errors.push("un atleta no debe poder invitar");
log("pantalla de condiciones (sin navegación hasta aceptar), página Acerca de y API de administración cerrada a atletas");

// 3. Panel de administración: necesita segundo factor; invitar, revocar, enlace de contraseña nueva y suspender
const adminEmail = `v19admin${run}@test.dev`;
const admin = await newPage();
admin.on("dialog", (d) => d.accept());
await login(admin, adminEmail, newUser(adminEmail, "ADMIN"));
await go(admin, "/admin");
await admin.getByText(/activa antes la verificación en dos pasos/).waitFor();
if ((await admin.request.get(B + "/api/admin/users")).status() !== 403) errors.push("admin sin segundo factor no debe ver las cuentas");
await addPasskey(admin);
await go(admin, "/settings");
await admin.getByRole("link", { name: "Abrir el panel de administración" }).first().waitFor();
await go(admin, "/admin");
await admin.getByLabel("Cuentas").getByText(athleteEmail).waitFor();
await checkA11y(admin, "/admin");

// Invitar desde el panel: el enlace se ve una vez y la invitación queda pendiente; después se revoca
const invited = `v19inv${run}@test.dev`;
await admin.fill("#inv-email", invited);
await admin.getByRole("button", { name: "Crear invitación" }).click();
const inviteBox = admin.getByRole("status").filter({ hasText: "Invitación creada" });
const inviteUrl = await inviteBox.getByRole("textbox", { name: "Enlace", exact: true }).inputValue({ timeout: 15_000 });
if (!/\/register\?invite=[A-Za-z0-9_-]{43}$/.test(inviteUrl)) errors.push(`enlace de invitación raro: ${inviteUrl}`);
const pending = admin.getByLabel("Invitaciones pendientes").getByRole("listitem").filter({ hasText: invited });
await pending.waitFor();
await shot(admin, "01-admin");
if ((await admin.request.post(B + "/api/admin/invitations", { data: { email: athleteEmail } })).status() !== 409) errors.push("invitar a un email que ya tiene cuenta debería dar 409");
await pending.getByRole("button", { name: "Revocar" }).click();
await pending.waitFor({ state: "detached" });
await inviteBox.getByRole("button", { name: "Cerrar" }).click();
log("panel solo con segundo factor; invitación creada, enlace visible una vez, duplicado rechazado y revocación");

// Enlace de contraseña nueva: lo usa la atleta en otro dispositivo; su sesión anterior se cierra
await admin.getByRole("button", { name: `Enlace de contraseña nueva para ${athleteEmail}` }).click();
const resetUrl = await admin.getByRole("status").filter({ hasText: "ponga una contraseña nueva" }).getByRole("textbox", { name: "Enlace", exact: true }).inputValue({ timeout: 15_000 });
const resetPath = new URL(resetUrl, B).pathname + new URL(resetUrl, B).search;
if (!/^\/reset\?token=[A-Za-z0-9_-]{43}$/.test(resetPath)) errors.push(`enlace de contraseña raro: ${resetPath}`);
const other = await newPage();
await go(other, resetPath);
if (!(await other.getByText(athleteEmail).count())) errors.push("el enlace no indica a qué cuenta pertenece");
await checkA11y(other, "/reset (formulario)");
await other.fill("#password", "otra-contraseña-larga-9");
await other.fill("#confirm", "otra-contraseña-distinta");
await other.click("button[type=submit]");
await other.getByText(/no coinciden/).waitFor();
// React vacía el formulario tras cada envío
await other.fill("#password", "otra-contraseña-larga-9");
await other.fill("#confirm", "otra-contraseña-larga-9");
await other.click("button[type=submit]");
await other.getByText("Contraseña cambiada").waitFor();
await go(athlete, "/training");
if (!/\/login/.test(athlete.url())) errors.push("tras cambiar la contraseña la sesión anterior sigue abierta");
await login(athlete, athleteEmail, "otra-contraseña-larga-9");
await go(other, resetPath);
await other.getByText("Enlace no válido").waitFor();
log("enlace de contraseña nueva de un solo uso: confirma, cambia, cierra la sesión anterior y no se reutiliza");

// Suspender y reactivar desde el panel
await go(admin, "/admin");
const row = admin.getByLabel("Cuentas").getByRole("listitem").filter({ hasText: athleteEmail });
await row.getByRole("button", { name: "Suspender" }).click();
await row.getByText(/suspendida/).waitFor();
await go(athlete, "/training");
if (!/\/login/.test(athlete.url())) errors.push("la sesión de una cuenta suspendida sigue abierta");
await athlete.fill("#email", athleteEmail);
await athlete.fill("#password", "otra-contraseña-larga-9");
await athlete.click("button[type=submit]");
await athlete.getByText(/suspendida/).first().waitFor();
await row.getByRole("button", { name: "Reactivar" }).click();
await row.getByRole("button", { name: "Suspender" }).waitFor();
await login(athlete, athleteEmail, "otra-contraseña-larga-9");
if (await admin.getByLabel("Cuentas").getByRole("listitem").filter({ hasText: "(tú)" }).getByRole("button", { name: "Suspender" }).count()) {
  errors.push("la administración puede suspenderse a sí misma");
}
await shot(admin, "02-cuentas");
log("suspender expulsa y bloquea el acceso; reactivar lo devuelve; nunca la propia cuenta");

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v19");
