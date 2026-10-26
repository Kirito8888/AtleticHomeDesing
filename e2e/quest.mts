// E2E del bloque «Estudio: Modo Juego, mapa de aventura» en un móvil de 390 px (necesita build de producción, DATABASE_URL y LIFEOS_FAKE_AI=1).
//   BASE_URL=http://localhost:3000 npm run e2e:quest
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import { chromium } from "playwright-core";

const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];
const out = process.env.SHOTS_DIR ?? "/tmp/e2e-out";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.185" } });
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

const email = `quest${Date.now()}@test.dev`;
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
psql(`insert into "StudyModule"(id,"userId",name,"updatedAt") values ('${mid}','${uid}','Bioquímica',now())`);
psql(`insert into "StudyTopic"(id,"userId","moduleId",name,tag) values ('t1${stamp}','${uid}','${mid}','Ciclo de Krebs','red'),('t2${stamp}','${uid}','${mid}','Glucólisis','yellow'),('t3${stamp}','${uid}','${mid}','Lípidos','grey')`);


const nodes = page.locator("[data-node]");

// 1 · desde la asignatura → «Modo Juego»
await page.goto(B + "/study?tab=modules");
await page.getByRole("link", { name: /Bioquímica/ }).click();
await page.waitForURL(/\/study\/modules\/[^/]+$/);
const modo = page.getByRole("link", { name: "Modo Juego" });
await minH(modo, "«Modo Juego»");
await modo.click();
await page.waitForURL(/\/quest$/);
await page.getByTestId("quest").waitFor();
await noOverflow("mapa");
log("«Modo Juego» desde la asignatura");

// 2 · 3 temas + Jefe Final; solo el primero abierto; 0 XP
if ((await nodes.count()) !== 4) errors.push(`nodos: ${await nodes.count()} ≠ 4`);
const names = await nodes.evaluateAll((els) => els.map((e) => e.textContent ?? ""));
if (!names[0].includes("Ciclo de Krebs") || !names[1].includes("Glucólisis") || !names[2].includes("Lípidos") || !names[3].includes("Jefe Final")) errors.push(`orden de nodos: ${names.join(" | ")}`);
const disabled = await nodes.evaluateAll((els) => els.map((e) => !!(e as HTMLButtonElement).disabled));
if (disabled.join() !== "false,true,true,true") errors.push(`bloqueo inicial: ${disabled.join()}`);
if ((await page.getByTestId("quest-lock").count()) !== 3) errors.push("deben verse 3 candados");
if ((await page.getByTestId("quest-xp").innerText()).trim() !== "0") errors.push("XP inicial ≠ 0");
if (!(await page.getByTestId("quest-rank").innerText()).includes("Novata")) errors.push("rango inicial ≠ Novata");
await minH(nodes, "nodos del mapa");
await minH(page.getByRole("button", { name: /Modo libre/ }), "«Modo libre»");
await minH(page.getByTestId("quest-dungeon"), "«Mazmorra»");
if (!(await page.getByTestId("quest-dungeon").isDisabled())) errors.push("la mazmorra sin fallos debe estar deshabilitada");
await page.screenshot({ path: `${out}/quest-390.png`, fullPage: true });
log("mapa: 3 temas + jefe, candados, 0 XP");

// 3 · pulsar el nivel 1 abre la partida (390 px): la IA se simula (mock de red). La 1.ª llamada falla (409) para probar el reintento
const th = (i: number) => ({ id: `ai:t1:mock${i}:t${i}`, lid: "t1", type: "t", t: [`Pregunta IA ${i}: ¿qué dicen los apuntes?`, ["Respuesta correcta", "Distractor A", "Distractor B", "Distractor C"], "Explicación de los apuntes."] });
const pr = (i: number) => ({ id: `ai:t1:mock${i}:p${i}`, lid: "t1", type: "p", p: { q: `Práctica IA ${i}: lista el archivo`, sol: `tar -tvf copia${i}.tar`, ok: [], sh: "b" } });
const mockItems = [th(0), th(1), th(2), th(3), pr(0), pr(1), pr(2), pr(3), pr(4)];
let aiCalls = 0;
let aiBody = "";
await page.route("**/api/ai/study/quest", async (rt) => {
  aiCalls++;
  aiBody = rt.request().postData() ?? "";
  await new Promise((r) => setTimeout(r, 700));
  if (aiCalls === 1) return rt.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "Esta asignatura no tiene apuntes procesados. Sube alguno para jugar." }) });
  return rt.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: mockItems, model: "simulado" }) });
});
await nodes.first().click();
await page.waitForURL(/\/quest\/play\?level=/);
await page.getByTestId("quest-loading").waitFor();
if (!(await page.getByTestId("quest-loading").innerText()).includes("Generando mazmorra")) errors.push("falta el texto «Generando mazmorra…»");
await noOverflow("carga");
await page.screenshot({ path: `${out}/quest-loading-390.png` });
await page.getByTestId("quest-error").waitFor();
if (!(await page.getByTestId("quest-error").innerText()).includes("apuntes procesados")) errors.push("el error 409 no se muestra");
await minH(page.getByTestId("quest-retry"), "«Reintentar»");
if (JSON.parse(aiBody).nodeId !== `t1${stamp}` || JSON.parse(aiBody).moduleId !== mid) errors.push(`cuerpo de la petición: ${aiBody}`);
await page.getByTestId("quest-retry").click();
log("carga «Generando mazmorra…», error 409 y reintento");
await page.getByTestId("quest-start").waitFor();
await page.waitForTimeout(500); // termina la animación pop (escala 0,9 → 1)
await page.waitForTimeout(500); // termina la animación pop (escala 0,9 → 1)
await minH(page.getByTestId("quest-start"), "«Empezar»");
await noOverflow("partida (intro)");
await page.getByTestId("quest-start").click();
await page.getByTestId("quest-card").waitFor();
await noOverflow("partida");
const lives = async () => Number(await page.getByTestId("quest-hearts").getAttribute("data-lives"));
if ((await lives()) !== 3) errors.push("deben empezar 3 corazones");
let sawShake = false;
let sawPracticeFail = false;
let sawDead = false;
for (let k = 0; k < 40 && !sawDead; k++) {
  const done = page.getByTestId("quest-result");
  if (await done.count()) {
    sawDead = true;
    break;
  }
  const cmd = page.locator("input[name=cmd]");
  if (await cmd.count()) {
    const before = await lives();
    await page.waitForTimeout(500);
    await minH(cmd, "terminal");
    await minH(page.getByRole("button", { name: /Comprobar/ }), "«Comprobar»");
    await cmd.fill("zzz no existe");
    await cmd.press("Enter");
    await page.getByTestId("quest-feedback").waitFor();
    if (!sawPracticeFail) {
      sawPracticeFail = true;
      if ((await lives()) !== before - 1) errors.push(`fallar una práctica debe quitar un corazón (${before} → ${await lives()})`);
      sawShake = await page.locator(".quest-shake").count().then((n) => n > 0);
      const card = await page.getByTestId("quest-card").getAttribute("data-fail");
      if (card !== "1") errors.push("la tarjeta fallada no se marca");
      await minH(page.getByTestId("quest-next"), "«Siguiente»");
    }
  } else {
    await minH(page.locator("[data-opt]"), "opciones de teoría");
    await page.locator("[data-opt]").first().click();
    await page.getByTestId("quest-feedback").waitFor();
  }
  await page.getByTestId("quest-next").click();
  await page.getByTestId("quest-card").or(page.getByTestId("quest-result")).waitFor();
}
if (!sawPracticeFail) errors.push("no apareció ninguna práctica");
if (!sawShake) errors.push("falta la animación shake al fallar");
const res3 = page.getByTestId("quest-result");
await res3.waitFor();
if (!(await res3.innerText()).includes("GAME OVER")) errors.push("al quedarse sin vidas debe verse GAME OVER");
await noOverflow("resultado");
await page.screenshot({ path: `${out}/quest-play-390.png`, fullPage: true });
if (!(await page.getByTestId("quest-review").innerText()).includes("✔")) errors.push("el repaso no muestra las soluciones");
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((q) => q.startsWith("atlenza.study.quest.")) ?? "") ?? "{}"));
if (!Array.isArray(stored.fails) || stored.fails.length < 3) errors.push(`fallos guardados: ${JSON.stringify(stored.fails)}`);
if (stored.lv?.[`t1${stamp}`]?.stars !== 0) errors.push("el Game Over no debe dar estrellas");
log("partida: corazón perdido con shake y Game Over");

// 3b · la mazmorra muestra los fallos, con vidas infinitas
await page.getByRole("link", { name: /Mazmorra/ }).click();
await page.waitForURL(/mode=dungeon/);
await page.getByTestId("quest-start").click();
await page.getByTestId("quest-card").waitFor();
await page.getByLabel("Vidas infinitas").waitFor();
await noOverflow("mazmorra");
const dq = await page.getByTestId("quest-card").innerText();
if (!/TEORÍA|PRÁCTICA/.test(dq)) errors.push("la mazmorra no muestra una pregunta");
if (!/IA \d/.test(dq)) errors.push("la mazmorra debe resolver los fallos con las preguntas generadas guardadas");
if (aiCalls !== 2) errors.push(`la mazmorra no debe llamar a la IA (llamadas: ${aiCalls})`);
log("mazmorra con los fallos y vidas infinitas");

// 3c · un nivel bloqueado no se juega por URL
await page.goto(`${B}/study/modules/${mid}/quest/play?level=t2${stamp}`);
await page.getByTestId("quest-locked").waitFor();
log("nivel bloqueado");
await page.goto(`${B}/study/modules/${mid}/quest`);
await page.getByTestId("quest").waitFor();

// 4 · modo libre desbloquea todo y se recuerda
const libre = page.getByRole("button", { name: /Modo libre/ });
await libre.click();
await page.getByRole("button", { name: "🔓 Modo libre: ON" }).waitFor();
if ((await nodes.evaluateAll((els) => els.filter((e) => !!(e as HTMLButtonElement).disabled).length)) !== 0) errors.push("el modo libre no abrió todos los nodos");
if ((await page.getByTestId("quest-lock").count()) !== 0) errors.push("quedan candados con el modo libre");
await page.reload();
await page.getByRole("button", { name: "🔓 Modo libre: ON" }).waitFor();
log("modo libre desbloquea y persiste");
await libre.click();

// 5 · ★★ en el nivel 1 abre el 2; fallos habilitan la mazmorra
const key = await page.evaluate(() => Object.keys(localStorage).find((k) => k.startsWith("atlenza.study.quest.")) ?? "");
if (key !== `atlenza.study.quest.${mid}`) errors.push(`clave de almacenamiento: ${key}`);
await page.evaluate(([k, t1]) => localStorage.setItem(k, JSON.stringify({ xp: 150, lv: { [t1]: { stars: 2, best: 85 } }, fails: ["L1:t0", "L1:p1"], free: false })), [key, `t1${stamp}`]);
await page.reload();
await page.getByTestId("quest").waitFor();
const d2 = await nodes.evaluateAll((els) => els.map((e) => !!(e as HTMLButtonElement).disabled));
if (d2.join() !== "false,false,true,true") errors.push(`desbloqueo con ★★: ${d2.join()}`);
if ((await page.getByTestId("quest-xp").innerText()).trim() !== "150") errors.push("XP guardada no se muestra");
const dung = page.getByRole("link", { name: /Mazmorra de fallos \(2\)/ });
await dung.click();
await page.waitForURL(/mode=dungeon/);
await page.getByTestId("quest-start").waitFor();
log("estrellas, XP y mazmorra desde localStorage");

// 6 · el estado no se comparte con otra asignatura
const mid2 = `mod2${stamp}`;
psql(`insert into "StudyModule"(id,"userId",name,"updatedAt") values ('${mid2}','${uid}','Otra',now())`);
await page.goto(`${B}/study/modules/${mid2}/quest`);
await page.getByText(/aún no tiene temas/).waitFor();
psql(`insert into "StudyTopic"(id,"userId","moduleId",name) values ('o1${stamp}','${uid}','${mid2}','Solo')`);
await page.reload();
if ((await page.getByTestId("quest-xp").innerText()).trim() !== "0") errors.push("el estado se coló en otra asignatura");
log("estado por asignatura y mapa vacío");

// 7 · asignatura inexistente: 404
const res = await page.goto(`${B}/study/modules/no-existe/quest`);
if (res?.status() !== 404) errors.push(`asignatura inexistente devolvió ${res?.status()}`);

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK quest");
