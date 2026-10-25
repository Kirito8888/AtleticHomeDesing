// E2E del bloque «Estudio: asignaturas, fecha de examen y ruta priorizada» en un móvil de 390 px (necesita build de producción y DATABASE_URL).
//   BASE_URL=http://localhost:3000 npm run e2e:v25m
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import { chromium } from "playwright-core";

const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];
const out = process.env.SHOTS_DIR ?? "/tmp/e2e-out";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.183" } });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
page.on("response", (r) => {
  if (r.url().includes("/api/") && r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`);
});
const noOverflow = async (where: string) => {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  if (w > 392) errors.push(`${where}: desborda en horizontal (${w}px)`);
};
const minH = async (loc: ReturnType<typeof page.locator>, what: string) => {
  const h = (await loc.first().boundingBox())?.height ?? 0;
  if (h < 43.5) errors.push(`${what} mide ${h}px (< 44)`);
};
const inDays = (n: number) => {
  const d = new Date(Date.now() + n * 86_400_000);
  return d.toLocaleDateString("sv", { timeZone: "Europe/Madrid" });
};

const email = `v25m${Date.now()}@test.dev`;
const created = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", "Atleta", "--role", "ATHLETE", "--accept-terms"], { encoding: "utf8" });
const pw = created.match(/Contraseña: (\S+)/)?.[1];
if (!pw) throw new Error("no se pudo crear la cuenta");
await page.goto(B + "/login");
await page.fill("#email", email);
await page.fill("#password", pw);
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);

const dbUrl = (process.env.DATABASE_URL ?? "").replace(/\?.*/, "");
const psql = (sql: string) => execFileSync("psql", [dbUrl, "-Atqc", sql], { encoding: "utf8" }).trim();
const uid = psql(`select id from "User" where email='${email}'`);
psql(`insert into "StudyDocument"(id,"userId",title,"mimeType","storagePath","sizeBytes",status,"updatedAt") values ('doc${Date.now()}','${uid}','Apuntes tema 5','text/plain','',10,'EMBEDDED',now())`);

const topicNames = () => page.locator("[data-topic]").evaluateAll((els) => els.map((e) => e.getAttribute("data-topic")));
const waitOrder = async (want: string[], what: string) => {
  const t0 = Date.now();
  while (Date.now() - t0 < 8000) {
    if (JSON.stringify(await topicNames()) === JSON.stringify(want)) return;
    await page.waitForTimeout(200);
  }
  errors.push(`${what}: orden ${JSON.stringify(await topicNames())} ≠ ${JSON.stringify(want)}`);
};

// 1 · crear la asignatura con fecha (mañana) desde /study
await page.goto(B + "/study?tab=modules");
await page.getByLabel("Nueva asignatura").fill("Bioquímica");
await page.getByLabel("Fecha del examen").fill(inDays(1));
await minH(page.getByLabel("Nueva asignatura"), "campo nombre");
await minH(page.getByLabel("Fecha del examen"), "campo fecha");
await minH(page.getByRole("button", { name: "Crear" }), "«Crear»");
await page.getByRole("button", { name: "Crear" }).click();
await page.waitForURL(/\/study\/modules\//);
await page.getByText("mañana").first().waitFor();
await noOverflow("detalle vacío");
log("asignatura creada con fecha de examen (mañana)");

// 2 · temas con prioridad
const add = async (name: string, tag: string, min: string) => {
  await page.getByLabel("Nuevo tema").fill(name);
  const radio = page.getByRole("radiogroup", { name: "Prioridad" }).getByRole("radio", { name: tag });
  await minH(radio, `prioridad ${tag}`);
  await radio.click();
  await page.getByLabel("Minutos estimados").fill(min);
  await page.getByRole("button", { name: "Añadir tema" }).click();
  await page.locator(`[data-topic="${name}"]`).waitFor();
};
await add("Seguro largo", "cae seguro", "240");
await add("Seguro corto", "cae seguro", "30");
await add("Probable", "probable", "60");
await add("Secundario", "secundario", "20");
await waitOrder(["Seguro largo", "Seguro corto", "Probable", "Secundario"], "orden manual");
log("temas en orden manual con el modo apagado");

// 3 · apunte
await page.getByLabel("Meter un apunte ya subido").selectOption({ label: "Apuntes tema 5" });
await page.getByRole("button", { name: "Meter apunte" }).click();
await page.locator('[data-topic="Apuntes tema 5"]').waitFor();
log("apunte metido en la asignatura (crea su tema)");

// 4 · modo preparación a 1 día: nota/minuto, lo que no llega queda al final, nada se pierde
const sw = page.getByRole("switch");
await minH(page.locator("label").filter({ has: sw }), "fila del modo preparación");
await sw.click();
await waitOrder(["Seguro corto", "Apuntes tema 5", "Secundario", "Probable", "Seguro largo"], "ruta a 1 día");
if (!(await page.locator('[data-topic="Seguro largo"]').innerText()).includes("no llega antes del examen")) errors.push("falta el aviso «no llega» en el tema largo");
if ((await page.locator('[data-topic="Seguro corto"] [aria-label="cae seguro"]').count()) !== 1) errors.push("falta 🔴 en el tema seguro");
await noOverflow("ruta a 1 día");
await page.screenshot({ path: `${out}/v25m-1dia.png`, fullPage: true });
log("1 día: más nota por minuto primero, el resto marcado y al final");

// 5 · misma asignatura a 30 días: cabe todo → por nivel
await page.getByLabel("Fecha del examen").fill(inDays(30));
await waitOrder(["Seguro corto", "Seguro largo", "Apuntes tema 5", "Probable", "Secundario"], "ruta a 30 días");
if ((await page.getByText("no llega antes del examen").count()) !== 0) errors.push("a 30 días no debería haber avisos de «no llega»");
await page.screenshot({ path: `${out}/v25m-30dias.png`, fullPage: true });
log("30 días: 🔴 → 🟡 → ⚪, todo cabe");

// 6 · marcar hecho lo manda al final; los controles son táctiles
const done = page.getByRole("checkbox", { name: /Hecho: Seguro corto/ });
await minH(done, "«Hecho»");
await done.click();
await waitOrder(["Seguro largo", "Apuntes tema 5", "Probable", "Secundario", "Seguro corto"], "hecho al final");
log("tema hecho al final de la ruta");

// 7 · volver a /study y verla en la lista; el selector de subida ofrece la asignatura
await page.goto(B + "/study?tab=modules");
await page.getByText("Bioquímica").first().waitFor();
await page.getByText(/faltan \d+ días/).first().waitFor();
await minH(page.getByRole("link", { name: /Bioquímica/ }), "tarjeta de asignatura");
await noOverflow("lista de asignaturas");
await page.goto(B + "/study");
await page.getByLabel("Asignatura (módulo)").waitFor();
log("lista de asignaturas con días restantes; subida con selector de asignatura");

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v25m");
