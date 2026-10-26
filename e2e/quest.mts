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


const dialogs: string[] = [];
page.on("dialog", (d) => {
  dialogs.push(d.message());
  void d.accept();
});
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
const disabled = await nodes.evaluateAll((els) => els.map((e) => (e as HTMLButtonElement).disabled));
if (disabled.join() !== "false,true,true,true") errors.push(`bloqueo inicial: ${disabled.join()}`);
if ((await page.getByTestId("quest-lock").count()) !== 3) errors.push("deben verse 3 candados");
if ((await page.getByTestId("quest-xp").innerText()).trim() !== "0") errors.push("XP inicial ≠ 0");
if (!(await page.getByTestId("quest-rank").innerText()).includes("Novata")) errors.push("rango inicial ≠ Novata");
await minH(nodes, "nodos del mapa");
await minH(page.getByRole("button", { name: /Modo libre/ }), "«Modo libre»");
await minH(page.getByRole("button", { name: /Mazmorra/ }), "«Mazmorra»");
if (!(await page.getByRole("button", { name: /Mazmorra/ }).isDisabled())) errors.push("la mazmorra sin fallos debe estar deshabilitada");
await page.screenshot({ path: `${out}/quest-390.png`, fullPage: true });
log("mapa: 3 temas + jefe, candados, 0 XP");

// 3 · pulsar un nivel abierto → solo un aviso
await nodes.first().click();
if (dialogs.length !== 1) errors.push(`aviso al pulsar nivel: ${dialogs.length}`);

// 4 · modo libre desbloquea todo y se recuerda
const libre = page.getByRole("button", { name: /Modo libre/ });
await libre.click();
await page.getByRole("button", { name: "🔓 Modo libre: ON" }).waitFor();
if ((await nodes.evaluateAll((els) => els.filter((e) => (e as HTMLButtonElement).disabled).length)) !== 0) errors.push("el modo libre no abrió todos los nodos");
if ((await page.getByTestId("quest-lock").count()) !== 0) errors.push("quedan candados con el modo libre");
await page.reload();
await page.getByRole("button", { name: "🔓 Modo libre: ON" }).waitFor();
log("modo libre desbloquea y persiste");
await libre.click();

// 5 · ★★ en el nivel 1 abre el 2; fallos habilitan la mazmorra
const key = await page.evaluate(() => Object.keys(localStorage).find((k) => k.startsWith("atlenza.study.quest.")) ?? "");
if (key !== `atlenza.study.quest.${mid}`) errors.push(`clave de almacenamiento: ${key}`);
await page.evaluate(([k, t1]) => localStorage.setItem(k, JSON.stringify({ xp: 150, lv: { [t1]: { stars: 2, best: 85 } }, fails: ["a:t1", "a:t2"], free: false })), [key, `t1${stamp}`]);
await page.reload();
await page.getByTestId("quest").waitFor();
const d2 = await nodes.evaluateAll((els) => els.map((e) => (e as HTMLButtonElement).disabled));
if (d2.join() !== "false,false,true,true") errors.push(`desbloqueo con ★★: ${d2.join()}`);
if ((await page.getByTestId("quest-xp").innerText()).trim() !== "150") errors.push("XP guardada no se muestra");
const dung = page.getByRole("button", { name: /Mazmorra de fallos \(2\)/ });
await dung.click();
if (dialogs.length !== 2) errors.push("la mazmorra no avisa");
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
