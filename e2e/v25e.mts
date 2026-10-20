// E2E del Bloque 8 (operación): /api/health anónimo, id de petición, «Estado» con el aviso de copias y errores sin datos personales, a 390 px.
//   BASE_URL=http://localhost:3000 npm run e2e:v25e   (necesita build de producción, DATABASE_URL y psql)
import { execFileSync } from "node:child_process";

import { chromium } from "playwright-core";

const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];
const psql = (sql: string) => execFileSync("psql", [process.env.DATABASE_URL!.split("?")[0], "-qtAc", sql], { encoding: "utf8" });
const user = (...a: string[]) => execFileSync("npm", ["run", "-s", "user", "--", ...a], { encoding: "utf8" });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.176" } });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));

// 1 · /api/health sin sesión: solo «ok» o «degradado»
const h = await page.request.get(B + "/api/health");
const hj = (await h.json()) as Record<string, unknown>;
if (!h.ok()) errors.push(`health: ${h.status()}`);
if (JSON.stringify(Object.keys(hj)) !== '["status"]' || !["ok", "degradado"].includes(String(hj.status))) errors.push(`health anónimo debe ser solo {status}: ${JSON.stringify(hj)}`);
log("/api/health anónimo:", hj.status);

// 2 · Id de petición en las rutas de /api (el entrante válido se respeta; el raro se sustituye)
const r1 = await page.request.get(B + "/api/admin/status", { headers: { "x-request-id": "e2e-req-12345678" } });
if (r1.headers()["x-request-id"] !== "e2e-req-12345678") errors.push(`x-request-id no respetado: ${r1.headers()["x-request-id"]}`);
const r2 = await page.request.get(B + "/api/admin/status", { headers: { "x-request-id": "mal id; con <espacios>" } });
if (!/^[0-9a-f-]{36}$/.test(r2.headers()["x-request-id"] ?? "")) errors.push(`x-request-id raro no sustituido: ${r2.headers()["x-request-id"]}`);
log("x-request-id");

// 3 · Administración (llave de acceso con autenticador virtual, como v18)
const email = `v25e${Date.now()}@test.dev`;
const pw = user("create", email, "--name", "Admin", "--role", "ADMIN", "--accept-terms").match(/Contraseña: (\S+)/)?.[1];
if (!pw) throw new Error("no se pudo crear la cuenta");
await page.goto(B + "/login");
await page.fill("#email", email);
await page.fill("#password", pw);
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);
const cdp = await ctx.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await page.goto(B + "/settings");
await page.getByLabel("Nombre de la llave").fill("Llave de administración");
await page.getByRole("button", { name: "Añadir llave" }).click();
await page.getByLabel("Mis llaves de acceso").getByText("Llave de administración").waitFor();

// Una copia fallida (aviso) y un error antiguo con datos personales en el mensaje (debe verse sin ellos)
const marker = `e2e-v25e-${Date.now()}`;
psql(`insert into "BackupRun" (id, ok, detail, at) values ('${marker}', false, 'disco lleno ${marker}', now() + interval '1 minute')`);
psql(`insert into "ServerError" (id, key, kind, path, message, count, "lastAt") values ('${marker}', '${marker}', 'ERROR', '/api/x', 'Invalid invocation { data: { nota: "dolor de rodilla", email: "ana.e2e@correo.es" } } 10.1.2.3', 1, now())`);
try {
  await page.goto(B + "/settings#servidor");
  await page.reload(); // solo cambia el hash respecto a /settings: sin recargar se vería la página anterior a las filas
  const status = page.getByLabel("Estado del servidor");
  await status.getByText(/Versión del código/).waitFor();
  const alert = status.getByRole("alert");
  await alert.filter({ hasText: /Copias de seguridad: La última copia de seguridad falló/ }).waitFor();
  await status.getByText("Errores 5xx (última hora)").waitFor();
  await status.getByLabel("Errores recientes").getByText(/Invalid invocation/).waitFor();
  const text = (await status.innerText()) + (await page.content().then((c) => c.replace(/<[^>]+>/g, " ")));
  for (const leak of ["ana.e2e@correo.es", "dolor de rodilla", "10.1.2.3"]) if (text.includes(leak)) errors.push(`«Estado» muestra datos personales: ${leak}`);
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  if (w > 392) errors.push(`/settings#servidor desborda en horizontal (${w}px)`);
  log("Estado: aviso de copias, errores 5xx y errores recientes sin datos personales");

  const hs = await page.request.get(B + "/api/health");
  const detail = (await hs.json()) as { status?: string; checks?: Record<string, unknown> };
  if (!detail.checks || Object.keys(detail.checks).sort().join() !== "db,queue") errors.push(`health con sesión sin detalle: ${JSON.stringify(detail)}`);
  log("/api/health con sesión: detalle db/queue");
} finally {
  psql(`delete from "BackupRun" where id = '${marker}'`);
  psql(`delete from "ServerError" where id = '${marker}'`);
}

await browser.close();
if (errors.length) {
  console.error("✖", errors.join("\n✖ "));
  process.exit(1);
}
console.log("OK v25e");
