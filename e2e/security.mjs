// E2E de seguridad y privacidad (v1.1). Necesita la app arrancada con el
// registro CERRADO (ALLOW_REGISTRATION=false y al menos un usuario en la BD) y
// DATABASE_URL en el entorno (crea usuarios con `npm run user`).
//   BASE_URL=http://localhost:3000 npm run e2e:security
// Cada contexto del navegador simula una IP distinta con X-Forwarded-For.
import { execFileSync } from "node:child_process";
import { generate } from "otplib";
import { chromium } from "playwright-core";

const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a) => console.log("✔", ...a);
const fail = (msg) => {
  throw new Error(msg);
};
const errors = [];
const run = Date.now();

/** Crea un usuario con el script de administración y devuelve su contraseña generada. */
function createUser(email) {
  const out = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", "E2E"], { encoding: "utf8" });
  const pw = out.match(/Contraseña: (\S+)/)?.[1];
  if (!pw) fail(`no se pudo crear ${email}: ${out}`);
  return pw;
}
const adminCli = (...args) => execFileSync("npm", ["run", "-s", "user", "--", ...args], { encoding: "utf8" });

// TOTP: un código ya usado no vuelve a valer (anti-reutilización), así que para
// cada uso hay que esperar al siguiente periodo de 30 s.
let lastTotpStep = -1;
async function freshTotp(secret) {
  while (Math.floor(Date.now() / 30_000) <= lastTotpStep) await new Promise((r) => setTimeout(r, 500));
  lastTotpStep = Math.floor(Date.now() / 30_000);
  return generate({ secret });
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let ipSeq = 1;
async function newPage() {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "es-ES",
    extraHTTPHeaders: { "x-forwarded-for": `198.51.100.${ipSeq++}` },
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/404/.test(m.text())) errors.push(`console ${page.url()}: ${m.text()}`);
  });
  return page;
}
const go = (page, path) => page.goto(B + path, { waitUntil: "load" });
async function login(page, email, password) {
  await go(page, "/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
}
// p[role=alert]: el error del formulario (el anunciador de rutas de Next también es role=alert).
const alertText = (page) => page.locator("p[role=alert]").first().textContent({ timeout: 10000 });

// 1. Registro cerrado
{
  const page = await newPage();
  await go(page, "/register");
  await page.getByText("Registro cerrado").waitFor();
  await go(page, "/login");
  if (await page.getByRole("link", { name: "Regístrate" }).count()) fail("el login enlaza a un registro cerrado");
  const res = await page.request.post(B + "/api/auth/register", {
    data: { name: "X", email: `x${run}@test.dev`, password: "contraseña-larga-1" },
  });
  if (res.status() !== 403) fail(`registro por API debería dar 403, dio ${res.status()}`);
  const csp = (await page.request.get(B + "/login")).headers()["content-security-policy"] ?? "";
  if (!/script-src 'self' 'nonce-/.test(csp)) fail(`CSP sin nonce: ${csp}`);
  log("registro cerrado (página, enlace y API) y CSP con nonce");
}

// 2. Límite por IP: 10 intentos / 15 min, aunque cada uno use un email distinto
{
  const page = await newPage();
  for (let i = 0; i < 10; i++) {
    await login(page, `nadie${i}-${run}@test.dev`, "x");
    if (!/incorrectos/.test(await alertText(page))) fail(`intento ${i + 1}: mensaje inesperado`);
  }
  await login(page, `nadie-${run}@test.dev`, "x");
  if (!/Demasiados intentos/.test(await alertText(page))) fail("el intento 11 desde la misma IP no se limitó");
  log("límite por IP tras 10 intentos");
}

// 3. Bloqueo de cuenta tras 5 fallos (desde otra IP) y desbloqueo por CLI
const lockEmail = `lock${run}@test.dev`;
{
  const pw = createUser(lockEmail);
  const page = await newPage();
  for (let i = 0; i < 4; i++) {
    await login(page, lockEmail, "mala-contraseña");
    if (!/incorrectos/.test(await alertText(page))) fail(`fallo ${i + 1}: mensaje inesperado`);
  }
  await login(page, lockEmail, "mala-contraseña");
  if (!/Demasiados intentos/.test(await alertText(page))) fail("el 5.º fallo no bloqueó la cuenta");
  await login(page, lockEmail, pw);
  if (!/Demasiados intentos/.test(await alertText(page))) fail("cuenta bloqueada aceptó la contraseña correcta");
  adminCli("unlock", lockEmail);
  const other = await newPage();
  await login(other, lockEmail, pw);
  await other.waitForURL((u) => !u.pathname.startsWith("/login"));
  log("bloqueo tras 5 fallos y desbloqueo con npm run user -- unlock");
}

// 4. Cambio de contraseña: expulsa la otra sesión abierta
const email = `sec${run}@test.dev`;
let password = createUser(email);
const a = await newPage();
const b = await newPage();
for (const p of [a, b]) {
  await login(p, email, password);
  await p.waitForURL((u) => !u.pathname.startsWith("/login"));
}
// El service worker guarda el HTML de las páginas visitadas (también las privadas).
const cachedPage = (p, path) =>
  p.evaluate(async (path) => Boolean(await caches.match(path)), path);
await b.evaluate(() => navigator.serviceWorker.ready.then(() => true));
await go(b, "/finance");
await b.waitForFunction(async () => Boolean(await caches.match("/finance")), null, { timeout: 10000 });
{
  await go(a, "/settings");
  await a.fill("#pw-current", password);
  password = "nueva-contraseña-2026";
  await a.fill("#pw-new", password);
  await a.fill("#pw-confirm", password);
  await a.getByRole("button", { name: "Cambiar contraseña" }).click();
  await a.waitForURL(/\/login/);
  await go(b, "/training");
  if (!/\/login/.test(b.url())) fail("la otra sesión sigue abierta tras cambiar la contraseña");
  await b.waitForFunction(async () => !(await caches.match("/finance")), null, { timeout: 10000 }).catch(() => {});
  if (await cachedPage(b, "/finance")) fail("la caché del service worker conserva /finance tras revocar la sesión");
  if (!(await cachedPage(b, "/offline"))) fail("se borró también la página /offline");
  await login(a, email, password);
  await a.waitForURL((u) => !u.pathname.startsWith("/login"));
  log("cambio de contraseña cierra todas las sesiones y vacía la caché de páginas privadas");
}

// 5. Consentimiento IA (sin consentimiento → 403 antes de llamar a Gemini)
{
  const r = await a.request.put(B + "/api/account/ai-consent", { data: { enabled: false } });
  if (!r.ok()) fail("no se pudo desactivar el consentimiento");
  const chat = await a.request.post(B + "/api/ai/study/chat", { data: { question: "¿Qué es la fuerza?" } });
  if (![403, 503].includes(chat.status())) fail(`IA sin consentimiento respondió ${chat.status()}`);
  const on = await (await a.request.put(B + "/api/account/ai-consent", { data: { enabled: true } })).json();
  if (!on.enabled) fail("no se pudo activar el consentimiento");
  log("IA bloqueada sin consentimiento; interruptor operativo");
}

// 6. Editar una sesión y repetir la última de fuerza
{
  const ex = await (await a.request.get(B + "/api/training/exercises")).json();
  const squat = ex.find((e) => /Sentadilla trasera/.test(e.name));
  const created = await (
    await a.request.post(B + "/api/training/sessions", {
      data: {
        date: new Date().toISOString().slice(0, 10),
        type: "STRENGTH",
        discipline: "STRENGTH",
        status: "COMPLETED",
        durationSec: 3600,
        sessionRpe: 7,
        strength: { sets: [{ exerciseId: squat.id, reps: 5, weightKg: 100, isWarmup: false }] },
      },
    })
  ).json();
  await go(a, `/training/${created.id}/edit`);
  await a.fill("#title", "Sesión editada E2E");
  await a.fill("#minutes", "90");
  await a.getByRole("button", { name: "Guardar cambios" }).click();
  await a.waitForURL(new RegExp(`/training/${created.id}$`));
  await a.getByRole("heading", { name: "Sesión editada E2E" }).waitFor();
  const after = await (await a.request.get(B + `/api/training/sessions/${created.id}`)).json();
  if (after.durationSec !== 5400 || after.strength.sets.length !== 1) fail("la edición no se guardó bien");
  if (!(after.tss > created.tss)) fail(`el TSS no se recalculó (${created.tss} → ${after.tss})`);
  await go(a, "/training/new?repeat=strength");
  await a.getByText(/Copia de la sesión de fuerza/).waitFor();
  log(`sesión editada (TSS ${created.tss} → ${after.tss}) y "repetir última fuerza" precarga`);
}

// 7a. Verificación en dos pasos (TOTP + códigos de recuperación + anti-reutilización)
{
  await go(a, "/settings");
  await a.fill("#totp-pw", password);
  await a.getByRole("button", { name: "Configurar verificación en dos pasos" }).click();
  await a.getByRole("img", { name: /Código QR/ }).waitFor();
  const secret = (await a.locator("code.break-all").textContent()).trim();
  await a.fill("#totp-confirm", await freshTotp(secret));
  await a.getByRole("button", { name: "Activar", exact: true }).click();
  const codesList = a.getByRole("list", { name: "Códigos de recuperación" });
  await codesList.waitFor({ timeout: 10000 }).catch(async () => {
    fail(`no aparecieron los códigos de recuperación: ${await a.locator("[data-sonner-toast]").allTextContents()}`);
  });
  const codes = (await a.getByRole("list", { name: "Códigos de recuperación" }).locator("li").allTextContents()).map((c) => c.trim());
  if (codes.length !== 10) fail(`se esperaban 10 códigos de recuperación, hay ${codes.length}`);
  await a.getByRole("button", { name: "Ya los he guardado" }).click();
  await a.getByText(/Activada desde el/).waitFor();

  // Login: contraseña correcta → pide código; código erróneo → rechazado; código bueno → entra
  const c = await newPage();
  await login(c, email, password);
  await c.locator("#code").waitFor();
  await c.fill("#code", "000000");
  await c.click("button[type=submit]");
  if (!/Código incorrecto/.test(await alertText(c))) fail("un código TOTP erróneo no se rechazó");
  const code = await freshTotp(secret);
  await c.fill("#code", code);
  await c.click("button[type=submit]");
  await c.waitForURL((u) => !u.pathname.startsWith("/login"));

  // El mismo código no vale dos veces (aunque siga dentro de su ventana de 30 s)
  const d = await newPage();
  await login(d, email, password);
  await d.fill("#code", code);
  await d.click("button[type=submit]");
  if (!/Código incorrecto/.test(await alertText(d))) fail("se aceptó un código TOTP reutilizado");

  // Código de recuperación: vale una vez
  await d.fill("#code", codes[0].toLowerCase());
  await d.click("button[type=submit]");
  await d.waitForURL((u) => !u.pathname.startsWith("/login"));
  const e = await newPage();
  await login(e, email, password);
  await e.fill("#code", codes[0]);
  await e.click("button[type=submit]");
  if (!/Código incorrecto/.test(await alertText(e))) fail("se aceptó un código de recuperación ya usado");

  // Registro de actividad visible
  await go(a, "/settings");
  for (const t of ["Verificación en dos pasos activada", "Código de recuperación usado", "Intento de inicio de sesión fallido"]) {
    if (!(await a.getByText(t).count())) fail(`falta "${t}" en la actividad reciente`);
  }

  // Recuperación por terminal: desactiva el 2FA y cierra las sesiones
  adminCli("disable-2fa", email);
  await go(a, "/settings");
  if (!/\/login/.test(a.url())) fail("disable-2fa debía cerrar las sesiones abiertas");
  await login(a, email, password);
  await a.waitForURL((u) => !u.pathname.startsWith("/login")); // ya sin código
  log("2FA: QR, código, rechazo de erróneos y reutilizados, recuperación de un solo uso, auditoría y disable-2fa");
}

// 7b. Permisos granulares del coach
{
  const coachEmail = `coach${run}@test.dev`;
  const coachPw = createUser(coachEmail);
  adminCli("set-role", coachEmail, "COACH");
  const coach = await newPage();
  await login(coach, coachEmail, coachPw);
  await coach.waitForURL((u) => !u.pathname.startsWith("/login"));
  const inv = await coach.request.post(B + "/api/coach/links", { data: { athleteEmail: email } });
  if (!inv.ok()) fail(`invitación del coach falló: ${inv.status()}`);
  const link = (await (await a.request.get(B + "/api/coach/links")).json()).asAthlete?.[0] ?? (await inv.json());
  const athleteId = link.athleteId;
  const ok = await a.request.patch(B + `/api/coach/links/${link.id}`, { data: { status: "ACTIVE" } });
  if (!ok.ok()) fail("el atleta no pudo aceptar el vínculo");

  if ((await coach.request.get(B + `/api/recovery?athleteId=${athleteId}`)).status() !== 200) fail("con todos los permisos el coach debía ver recuperación");
  await go(a, "/settings");
  await a.getByRole("switch", { name: "Recuperación y lesiones" }).click();
  await a.getByText("Permisos actualizados").first().waitFor();
  if ((await coach.request.get(B + `/api/recovery?athleteId=${athleteId}`)).status() !== 403) fail("sin el permiso RECOVERY el coach sigue viendo la recuperación");
  if ((await coach.request.get(B + `/api/training/pmc?athleteId=${athleteId}`)).status() !== 200) fail("quitar RECOVERY no debía afectar a la carga");
  const otherCoachScope = await a.request.patch(B + `/api/coach/links/${link.id}`, { data: { scopes: ["LOAD"] } });
  if (!otherCoachScope.ok()) fail("el atleta no pudo cambiar los permisos por API");
  const coachTry = await coach.request.patch(B + `/api/coach/links/${link.id}`, { data: { scopes: ["LOAD", "RECOVERY"] } });
  if (coachTry.status() !== 403) fail("el coach no debe poder ampliarse los permisos");
  log("permisos del coach por ámbito: recuperación bloqueada, carga permitida, el coach no puede cambiarlos");
}

// 7. Exportaciones
{
  const res = await a.request.get(B + "/api/account/export");
  const text = await res.text();
  if (!res.ok() || !text.includes(email) || /passwordHash|scrypt\$|totpSecret|recoveryCode|"v1:/.test(text)) fail("exportación JSON incorrecta (o con secretos)");
  const csv = await a.request.get(B + "/api/export/training");
  const body = await csv.text();
  if (!body.startsWith("﻿fecha;tipo") || !body.includes("Sesión editada E2E")) fail("CSV de entrenos incorrecto");
  log("exportación JSON sin hash y CSV de entrenos");
}

// 8. Borrar cuenta
{
  await go(a, "/settings");
  await a.fill("#del-pw", password);
  await a.fill("#del-confirm", "ELIMINAR");
  await a.getByRole("button", { name: "Eliminar mi cuenta" }).click();
  await a.waitForURL(/\/login/);
  const c = await newPage();
  await login(c, email, password);
  if (!/incorrectos/.test(await alertText(c))) fail("la cuenta borrada sigue pudiendo entrar");
  if (adminCli("list").includes(email)) fail("el usuario sigue en la BD");
  log("cuenta eliminada con todos sus datos");
}

await browser.close();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("Seguridad: todo correcto, sin errores de consola (CSP incluida)");
