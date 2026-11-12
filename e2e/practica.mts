// E2E del bloque «Estudio: Práctica guiada de ejercicios» en un móvil de 390 px (necesita build de producción, DATABASE_URL y LIFEOS_FAKE_AI=1).
//   BASE_URL=http://localhost:3000 npm run e2e:practica
import { execFileSync } from "node:child_process";

import { chromium } from "playwright-core";

const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.187" } });
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

const email = `prac${Date.now()}@test.dev`;
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
psql(`insert into "StudyModule"(id,"userId",name,"updatedAt") values ('${mid}','${uid}','Programación PHP',now())`);
psql(`insert into "StudyDocument"(id,"userId","moduleId",title,"mimeType","storagePath","sizeBytes",status,"embedModel","updatedAt") values ('${did}','${uid}','${mid}','Ejercicios de PHP','text/markdown','',10,'EMBEDDED','texto',now())`);
const text = "En PHP se imprime texto con echo y cada sentencia termina en punto y coma. Un bucle for repite instrucciones un número fijo de veces.";
psql(`insert into "DocumentChunk"(id,"documentId","userId","chunkIndex",content) values ('ch${stamp}','${did}','${uid}',0,'${text}')`);
const countAll = () => psql(`select (select count(*) from "StudyDocument" where "userId"='${uid}') || '|' || (select count(*) from "DocumentChunk" where "userId"='${uid}') || '|' || (select count(*) from "StudyTopic" where "userId"='${uid}')`);
const before = countAll();

// 1 · asignatura → «Practicar»
await page.goto(B + "/study?tab=modules");
await page.getByRole("link", { name: /Programación PHP/ }).click();
await page.waitForURL(/\/study\/modules\/[^/]+$/);
const practicar = page.getByRole("link", { name: "Practicar" });
await minH(practicar, "«Practicar»");
await practicar.click();
await page.waitForURL(/\/practice$/);
await page.getByTestId("pr-generate").waitFor();
await minH(page.getByTestId("pr-generate"), "«Generar ejercicios»");
await noOverflow("práctica (intro)");
log("«Practicar» desde la asignatura; los apuntes subidos salen para elegir");

// 2 · generar
await page.getByTestId("pr-generate").click();
await page.getByTestId("pr-active").waitFor();
if (!(await page.getByText(/Ejercicio 1 de 3/).count())) errors.push("no aparece «Ejercicio 1 de 3»");
log("genera 3 ejercicios basados en los apuntes");

// 3 · pistas progresivas
await page.getByTestId("pr-hint").click();
await page.getByTestId("pr-hint").click();
if ((await page.getByTestId("pr-hints").locator("li").count()) !== 2) errors.push("esperaba 2 pistas visibles");
await minH(page.getByTestId("pr-hint"), "«Pedir pista»");
log("pistas progresivas una a una");

// 4 · corregir un fallo
await page.getByTestId("pr-answer").fill('<?php\necho "Hola 1"\n');
await page.getByTestId("pr-correct").click();
await page.getByTestId("pr-review").waitFor();
const rev = await page.getByTestId("pr-review").innerText();
if (!/Error · línea 2/.test(rev) || !/punto y coma/.test(rev)) errors.push(`la corrección no señala la línea 2: ${rev.slice(0, 200)}`);
if (!/Casi/.test(await page.getByTestId("pr-verdict").innerText())) errors.push("veredicto distinto de «Casi»");
await noOverflow("práctica (corrección)");
log("corrección línea a línea de un error");

// 5 · corregir un acierto en el siguiente ejercicio
await page.getByTestId("pr-next").click();
await page.getByTestId("pr-answer").fill('<?php\necho "Hola 2";\n');
await page.getByTestId("pr-correct").click();
await page.getByText("Correcto", { exact: true }).waitFor();
log("corrección de un acierto");

// 6 · recargar: la tanda sigue (localStorage)
await page.reload();
await page.getByTestId("pr-active").waitFor();
if (!(await page.getByText(/Ejercicio 2 de 3/).count())) errors.push("tras recargar no vuelve al ejercicio 2");
if ((await page.getByTestId("pr-answer").inputValue()) !== '<?php\necho "Hola 2";\n') errors.push("tras recargar se perdió el código");
log("la tanda persiste tras recargar");

// 7 · solución esperada y nueva tanda
await page.getByRole("button", { name: "Ver solución esperada" }).click();
await page.getByTestId("pr-solution").waitFor();
await page.getByTestId("pr-reset").click();
await page.getByTestId("pr-generate").waitFor();

// 8 · nada se guardó en el servidor; ajena 404 y sin cuerpo 400
if (countAll() !== before) errors.push("la práctica escribió en la BD");
const post = (path: string, body: unknown) => page.evaluate(async ([p, b]) => (await fetch(p as string, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })).status, [path, body]);
if ((await post("/api/ai/study/practice", { moduleId: "no-existe" })) !== 404) errors.push("asignatura inexistente no da 404");
if ((await post("/api/ai/study/practice/review", { moduleId: mid })) !== 400) errors.push("cuerpo inválido no da 400");

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK practica");
