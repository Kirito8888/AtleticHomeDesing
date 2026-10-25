// E2E del bloque «Estudio: Evaluar nivel (test de autoevaluación)» en un móvil de 390 px (necesita build de producción, DATABASE_URL y LIFEOS_FAKE_AI=1).
//   BASE_URL=http://localhost:3000 npm run e2e:v25n
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import { chromium } from "playwright-core";

const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];
const out = process.env.SHOTS_DIR ?? "/tmp/e2e-out";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.184" } });
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
  const n = await loc.count();
  if (!n) return void errors.push(`${what}: no existe`);
  for (let i = 0; i < n; i++) {
    const h = (await loc.nth(i).boundingBox())?.height ?? 0;
    if (h < 43.5) errors.push(`${what} #${i} mide ${h}px (< 44)`);
  }
};

const email = `v25n${Date.now()}@test.dev`;
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
const stamp = Date.now();
const mid = `mod${stamp}`;
const did = `doc${stamp}`;
psql(`insert into "StudyModule"(id,"userId",name,"updatedAt") values ('${mid}','${uid}','Bioquímica',now())`);
psql(`insert into "StudyTopic"(id,"userId","moduleId",name,tag) values ('t1${stamp}','${uid}','${mid}','Ciclo de Krebs','red'),('t2${stamp}','${uid}','${mid}','Glucólisis','yellow')`);
psql(`insert into "StudyDocument"(id,"userId","moduleId",title,"mimeType","storagePath","sizeBytes",status,"embedModel","updatedAt") values ('${did}','${uid}','${mid}','Apuntes tema 5','text/markdown','',10,'EMBEDDED','texto',now())`);
const text = "El ciclo de Krebs ocurre en la matriz mitocondrial de la célula. Produce NADH y FADH2 en cada vuelta del ciclo. La glucólisis convierte la glucosa en piruvato en el citoplasma.";
psql(`insert into "DocumentChunk"(id,"documentId","userId","chunkIndex",content) values ('ch${stamp}','${did}','${uid}',0,'${text}')`);

// 1 · desde /study → asignatura → «Evaluar nivel»
await page.goto(B + "/study?tab=modules");
await page.getByRole("link", { name: /Bioquímica/ }).click();
await page.waitForURL(/\/study\/modules\/[^/]+$/);
const evaluar = page.getByRole("link", { name: "Evaluar nivel" });
await minH(evaluar, "«Evaluar nivel»");
await evaluar.click();
await page.waitForURL(/\/test$/);
await noOverflow("inicio del test");
log("«Evaluar nivel» desde la asignatura");

// 2 · empezar con 6 preguntas
const radios = page.getByRole("radiogroup", { name: "Preguntas" }).getByRole("radio");
await minH(radios, "nº de preguntas");
await radios.first().click();
await minH(page.getByRole("button", { name: "Empezar test" }), "«Empezar test»");
await page.getByRole("button", { name: "Empezar test" }).click();
await page.getByTestId("st-progress").waitFor();
log("test generado");

// 3 · paso a paso: teoría → opción; caso → texto
const total = 6;
for (let n = 1; n <= total; n++) {
  const prog = (await page.getByTestId("st-progress").innerText()).replace(/\s+/g, " ");
  if (!prog.includes(`${n}/${total}`)) errors.push(`progreso «${prog}» ≠ ${n}/${total}`);
  await noOverflow(`pregunta ${n}`);
  const opts = page.getByRole("radiogroup", { name: "Opciones" }).getByRole("radio");
  if (await opts.count()) {
    await minH(opts, `opciones de la pregunta ${n}`);
    await opts.first().click(); // en la IA simulada la primera es la correcta
  } else {
    await page.getByLabel("Tu respuesta").fill("La respuesta razonada del caso.");
  }
  if (n === 1) await page.screenshot({ path: `${out}/v25n-pregunta.png`, fullPage: true });
  const next = page.getByRole("button", { name: n === total ? "Terminar" : "Siguiente" });
  await minH(next, "botón siguiente");
  await next.click();
}
log("6 preguntas respondidas paso a paso");

// 4 · autocalificar los casos
await page.getByRole("heading", { name: "Corrige tus casos prácticos" }).waitFor();
await noOverflow("autocalificar");
const groups = page.getByRole("radiogroup", { name: "Tu puntuación" });
const nCases = await groups.count();
if (nCases < 1) errors.push("no hay casos prácticos");
for (let g = 0; g < nCases; g++) {
  const bien = groups.nth(g).getByRole("radio", { name: "Bien" });
  await minH(bien, "«Bien»");
  await bien.click();
}
await page.getByRole("button", { name: "Ver resultado" }).click();

// 5 · resultado
await page.getByTestId("st-score").waitFor();
const score = await page.getByTestId("st-score").innerText();
if (!/^10/.test(score.trim())) errors.push(`nota ${JSON.stringify(score)}; con todo bien debía ser 10`);
if (!(await page.getByTestId("st-label").innerText()).includes("Lista para el 10")) errors.push("falta «Lista para el 10»");
await page.getByRole("heading", { name: "Qué te falta para el 10" }).waitFor();
const sols = await page.locator("[data-solution]").count();
if (sols !== total) errors.push(`soluciones ${sols} ≠ ${total}`);
if (!(await page.locator("[data-solution]").first().innerText()).includes("De tus apuntes")) errors.push("falta la cita de los apuntes");
await minH(page.getByRole("button", { name: "Repetir con lo flojo" }), "«Repetir»");
await noOverflow("resultado");
await page.screenshot({ path: `${out}/v25n-resultado.png`, fullPage: true });
log("resultado: nota /10, qué falta y soluciones con cita");

// 6 · el último intento queda recordado en este dispositivo
await page.reload();
await page.getByText(/Último intento/).waitFor();
log("último intento recordado");

// 7 · asignatura ajena: 404
const status = await page.evaluate(async () => (await fetch("/api/ai/study/self-test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ moduleId: "no-existe" }) })).status);
if (status !== 404) errors.push(`asignatura inexistente devolvió ${status}`);

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v25n");
