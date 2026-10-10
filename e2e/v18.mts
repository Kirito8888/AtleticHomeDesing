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

// 2. Bloque B · Primer uso, papelera con «Deshacer», notificaciones, búsqueda, horas de silencio y compartir
await go(B + "/");
await page.getByRole("link", { name: /Configura Atlenza en 1 minuto/ }).click();
await page.waitForURL(/\/welcome/);
await checkA11y("/welcome");
await page.getByLabel("Partes de Atlenza").getByRole("checkbox", { name: "Finanzas" }).click();
await page.getByRole("button", { name: "Siguiente" }).click();
await page.getByLabel("Cómo te llamas").fill("Alba V18");
await page.getByLabel("Sexo").getByRole("radio", { name: "Mujer" }).click();
await page.getByRole("button", { name: "Siguiente" }).click();
await page.getByRole("button", { name: "Empezar" }).click();
await page.waitForURL((u) => u.pathname === "/");
await page.getByRole("heading", { name: /Hola, Alba/ }).waitFor();
if (await page.getByRole("link", { name: /Configura Atlenza en 1 minuto/ }).count()) errors.push("la invitación de bienvenida sigue tras completarla");
if (await page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Finanzas" }).count()) errors.push("Finanzas debía quedar oculto tras la bienvenida");
await api("patch", "/api/settings/prefs", { hiddenModules: [] });

// Papelera: sesión borrada y recuperada con «Deshacer»; comida borrada y recuperada desde Ajustes → Papelera
const tagged = (await api("post", "/api/training/sessions", { date: madrid, type: "STRENGTH", status: "COMPLETED", title: "Salidas de tacos V18", durationMin: 40, rpe: 6, tags: ["reaccion"], strength: { sets: [] } })) as { id?: string };
await go(`${B}/training/${tagged.id}`);
page.once("dialog", (d) => void d.accept());
await page.getByRole("button", { name: "Borrar" }).click();
await page.waitForURL(/\/training$/);
await page.getByRole("button", { name: "Deshacer" }).click();
await toast(/Recuperado/);
await go(`${B}/training/${tagged.id}`);
await page.getByText("Salidas de tacos V18").first().waitFor();
await api("post", "/api/nutrition/entries", { date: madrid, mealType: "LUNCH", customName: "Garbanzos V18", quantityG: 200, kcal: 280, proteinG: 15, carbsG: 40, fatG: 5 });
await go(B + "/nutrition");
await page.getByRole("button", { name: "Quitar Garbanzos V18" }).click();
await toast(/Garbanzos V18 quitado/);
await go(B + "/settings/trash");
await checkA11y("/settings/trash");
const trash = page.getByRole("list", { name: "Papelera" });
await trash.getByText(/Garbanzos V18/).waitFor();
await trash.getByRole("listitem").filter({ hasText: "Garbanzos V18" }).getByRole("button", { name: "Recuperar" }).click();
await toast(/Recuperado: Garbanzos V18/);
await go(B + "/nutrition");
await page.getByRole("button", { name: "Quitar Garbanzos V18" }).waitFor();

// Búsqueda por etiqueta del diario técnico
await go(B + "/search?q=reaccion");
await page.getByRole("heading", { name: "Etiqueta «reaccion»" }).waitFor();

// Centro de notificaciones: el aviso de inicio de sesión queda en la campana aunque no haya push
await go(B + "/");
await page.getByRole("link", { name: /Notificaciones: \d+ sin leer/ }).first().click();
await page.waitForURL(/\/notifications/);
await page.getByRole("list", { name: "Notificaciones" }).getByText("Nuevo inicio de sesión en Atlenza").first().waitFor();
await checkA11y("/notifications");
await page.getByRole("link", { name: "Notificaciones", exact: true }).first().waitFor({ timeout: 15_000 });

// Horas de silencio
await go(B + "/settings");
await page.getByLabel("Silencio desde").fill("23:00");
await page.getByLabel("Hasta", { exact: true }).fill("07:00");
await page.getByRole("button", { name: "Guardar horas de silencio" }).click();
await toast(/Horas de silencio guardadas/);
const prefs = (await (await page.request.get(B + "/api/settings/prefs")).json()) as { quietHours?: { from: string; to: string } | null };
if (prefs.quietHours?.from !== "23:00" || prefs.quietHours?.to !== "07:00") errors.push(`horas de silencio: ${JSON.stringify(prefs.quietHours)}`);

// Compartir con Atlenza: el service worker recibe el POST del sistema, /share propone el destino
const ics = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:" + plusDays(madrid, 40).replaceAll("-", "") + "\r\nSUMMARY:Control federativo V18\r\nLOCATION:Valencia\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
await go(B + "/share");
const viaSw = await page.evaluate(async (body) => {
  const reg = await Promise.race([navigator.serviceWorker?.ready, new Promise((r) => setTimeout(r, 5000))]);
  if (!reg || !navigator.serviceWorker.controller) return false;
  const fd = new FormData();
  fd.append("files", new File([body], "federacion.ics", { type: "text/calendar" }));
  const r = await fetch("/share", { method: "POST", body: fd });
  return r.ok && new URL(r.url).pathname === "/share";
}, ics);
if (!viaSw) {
  // Sin service worker que controle la página (primera carga): se deja el fichero como lo haría él
  await page.evaluate(async (body) => {
    const c = await caches.open("lifeos-share");
    await c.put("/__shared/0", new Response(body, { headers: { "content-type": "text/calendar", "x-name": "federacion.ics" } }));
  }, ics);
}
await go(B + "/share");
await page.getByRole("list", { name: "Ficheros compartidos" }).getByText("federacion.ics").waitFor();
await checkA11y("/share");
await page.getByRole("navigation", { name: "Qué hacer con el fichero" }).getByRole("link", { name: /Calendario de competiciones/ }).click();
await page.getByRole("list", { name: "Competiciones encontradas" }).getByText(/Control federativo V18/).waitFor();
await go(B + "/share");
await page.getByText(/No hay nada compartido/).waitFor();
await shot("02-uso");
log(`primer uso, papelera con deshacer, búsqueda por etiqueta, notificaciones, horas de silencio y compartir (${viaSw ? "service worker" : "caché directa"})`);

// 3. Bloque C · Objetivos, revisión, examen simulado, semana, temporada, finanzas, viaje, posponer y CSV
await go(B + "/goals");
await radio("Tipo de objetivo", "Otro (a mano)").click();
await page.getByLabel("Nombre (opcional)").fill("Leer 12 libros V18");
await page.getByLabel(/^Objetivo/).fill("12");
await page.getByRole("button", { name: "Crear objetivo" }).click();
await toast(/Objetivo creado/);
await page.getByRole("list", { name: "Objetivos" }).getByText("Leer 12 libros V18").waitFor();
await checkA11y("/goals");
await go(B + "/review");
await page.getByRole("list", { name: "Resumen de la semana" }).getByText(/sesi(ón|ones) · TSS/).waitFor();
await page.getByLabel("¿Qué ha ido bien?").fill("Constancia en la técnica");
await page.getByLabel("Foco de la próxima semana").fill("Dormir 8 horas V18");
await page.getByRole("button", { name: "Guardar revisión" }).click();
await toast(/Revisión guardada/);
await checkA11y("/review");
await go(B + "/");
await page.getByRole("link", { name: "Foco de la semana" }).getByText("Dormir 8 horas V18").waitFor();
await page.getByText("Leer 12 libros V18").first().waitFor();

// Examen simulado (3 tarjetas: 2 bien y 1 mal)
await api("post", "/api/study/cards", { deck: "Anatomía V18", lines: "Fémur|Hueso del muslo\nTibia|Hueso de la pierna\nRadio|Hueso del antebrazo" });
await go(B + "/study/exam");
await page.getByLabel("Preguntas").selectOption("5");
await page.getByRole("button", { name: "Empezar examen" }).click();
for (const ok of [true, false, true]) {
  await page.getByRole("button", { name: "Ver respuesta" }).click();
  await page.getByRole("button", { name: ok ? "La sabía" : "La fallé" }).click();
}
const result = page.getByRole("status", { name: "Resultado del examen" });
await result.getByText(/6,7 \/ 10/).waitFor();
await result.getByRole("list", { name: "Tarjetas falladas" }).getByRole("listitem").first().waitFor();
await checkA11y("/study/exam (resultado)");

// Mi semana e informe de temporada
await go(B + "/planning/week-all");
await page.getByRole("list", { name: "Días de la semana" }).getByText("Salidas de tacos V18").waitFor();
await checkA11y("/planning/week-all");
await noOverflow("/planning/week-all");
await go(`${B}/print/season?year=${madrid.slice(0, 4)}`);
await page.getByRole("heading", { name: `Temporada ${madrid.slice(0, 4)}` }).waitFor();
await page.getByRole("table", { name: "Carga por mes" }).waitFor();

// Finanzas: categorizar con «aplicar a los parecidos» y fondo de emergencia
const bank = (await api("post", "/api/finance/accounts", { name: "Banco V18", type: "ASSET" })) as { id: string };
await api("post", "/api/finance/categories", { name: "Súper V18", kind: "EXPENSE" });
for (const d of ["COMPRA TARJ. 1234 MERCADONA VALENCIA", "MERCADONA VALENCIA 2"]) {
  await api("post", "/api/finance/transactions", { mode: "simple", kind: "EXPENSE", date: madrid, description: d, amountCents: 2500, moneyAccountId: bank.id });
}
await go(B + "/finance");
await page.getByRole("button", { name: "Categorizar COMPRA TARJ. 1234 MERCADONA VALENCIA" }).click();
await page.getByLabel("Categoría de COMPRA TARJ. 1234 MERCADONA VALENCIA").selectOption({ label: "Súper V18" });
await page.getByRole("button", { name: "Guardar", exact: true }).click();
await toast(/Regla «mercadona valencia» guardada · 2 movimientos/);
await page.getByRole("list", { name: "Reglas de categoría" }).getByText(/mercadona valencia/).waitFor();
await page.getByText("Fondo de emergencia").first().waitFor();
await checkA11y("/finance");

// Viaje de competición: lugar del estadio
const trip = (await api("post", "/api/planning/events", { type: "COMPETITION", title: "Autonómico V18", startAt: plusDays(madrid, 6) })) as { id: string };
await go(`${B}/planning/competition/${trip.id}`);
await page.getByLabel("Latitud del estadio").fill("39.470");
await page.getByLabel("Longitud del estadio").fill("-0.376");
await page.getByRole("button", { name: "Guardar lugar" }).click();
await toast(/Lugar guardado/);
await page.getByRole("button", { name: "Quitar" }).first().waitFor();

// Posponer una notificación desde el centro
await go(B + "/notifications");
await page.getByRole("button", { name: "Recordar en 1 h" }).first().click();
await page.getByText(/Te lo recuerdo a las/).first().waitFor();

// CSV por módulo
const csv: Record<string, string> = {};
for (const kind of ["recovery", "nutrition", "study"]) {
  const r = await page.request.get(`${B}/api/export/${kind}`);
  if (!r.ok() || !(r.headers()["content-type"] ?? "").includes("text/csv")) errors.push(`CSV ${kind}: ${r.status()}`);
  csv[kind] = await r.text();
}
if (!csv.nutrition.includes("Garbanzos V18")) errors.push("el CSV de comidas no trae la comida registrada");
await shot("03-nuevas");
log("objetivos, revisión semanal, examen simulado, mi semana, temporada, reglas de categoría, fondo de emergencia, viaje, posponer y CSV");

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v18");
