// E2E del bloque «Estudio: micro-pasos y temporizador de micro-intervalos» en un móvil de 390 px (necesita build de producción, DATABASE_URL y LIFEOS_FAKE_AI=1).
//   BASE_URL=http://localhost:3000 npm run e2e:v25l
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import { chromium } from "playwright-core";

const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];
const out = process.env.SHOTS_DIR ?? "/tmp/e2e-out";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.182" } });
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

const email = `v25l${Date.now()}@test.dev`;
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
const writes = () =>
  psql(`select (select count(*) from "StudyDocument" where "userId"='${uid}') || '/' || (select count(*) from "Flashcard" f join "FlashcardDeck" d on d.id=f."deckId" where d."userId"='${uid}')`);

const NOTES =
  "La glucólisis es la vía que convierte la glucosa en piruvato y ocurre en el citoplasma de la célula. Produce 2 ATP netos por molécula de glucosa. " +
  "Si hay oxígeno, el piruvato entra en la mitocondria para seguir oxidándose. Si no lo hay, se convierte en lactato para regenerar NAD+ y la vía puede continuar. " +
  "La regulación principal ocurre en la fosfofructoquinasa, que responde a la energía disponible. Es la base del metabolismo anaeróbico del músculo en esfuerzos intensos.";

await page.clock.install();
await page.goto(B + "/study?tab=steps");
await page.getByRole("tab", { name: "Pasos" }).waitFor();
// Entrada por URL con ?tab=: se espera a que el panel lazy esté montado e hidratado antes de interactuar
await page.getByRole("tab", { name: "Pasos" }).and(page.locator('[aria-selected="true"]')).waitFor();
await page.getByRole("tabpanel").first().waitFor();
await page.waitForLoadState("networkidle");
await noOverflow("/study (pestañas)");
log("pestaña «Pasos» visible, sin desborde");

// 1 · dividir
const before = writes();
await page.getByRole("radio", { name: "Texto", exact: true }).click();
await page.fill("#steps-text", NOTES);
await minH(page.getByRole("button", { name: "Dividir en pasos" }), "«Dividir en pasos»");
await page.getByRole("button", { name: "Dividir en pasos" }).click();
const list = page.getByRole("radiogroup", { name: "Paso" });
await list.waitFor();
const n = await list.getByRole("radio").count();
if (n < 4 || n > 6) errors.push(`${n} pasos (esperaba 4–6)`);
for (let i = 0; i < n; i++) await minH(list.getByRole("radio").nth(i), `paso ${i + 1}`);
await noOverflow("lista de pasos");
await page.screenshot({ path: `${out}/v25l-steps.png`, fullPage: true });
log(`${n} micro-pasos, cada uno ≥ 44 px`);

// 2 · elegir paso 2 y preset 15/3
await list.getByRole("radio").nth(1).click();
const presets = page.getByRole("radiogroup", { name: "Intervalo" });
for (const l of ["10/2 min", "15/3 min", "20/5 min"]) await minH(presets.getByRole("radio", { name: l }), `preset ${l}`);
await presets.getByRole("radio", { name: "15/3 min" }).click();
await minH(page.getByRole("button", { name: "Empezar este paso" }), "«Empezar este paso»");
await page.getByRole("button", { name: "Empezar este paso" }).click();

// 3 · vista enfocada: solo la tarea actual
const focus = page.getByTestId("micro-focus");
await focus.waitFor();
await focus.getByText(`Paso 2 de ${n}`).waitFor();
if (await page.getByRole("radiogroup", { name: "Paso" }).count()) errors.push("la lista de pasos sigue visible en la vista enfocada");
if (await page.getByRole("button", { name: "Dividir en pasos" }).count()) errors.push("el formulario sigue visible en la vista enfocada");
if ((await focus.getByRole("timer").innerText()).trim() !== "15:00") errors.push(`temporizador inicial ${await focus.getByRole("timer").innerText()}`);
await focus.getByRole("progressbar").waitFor();
for (const l of ["Pausar", "Paso hecho", "Salir"]) await minH(focus.getByRole("button", { name: l }), `«${l}»`);
await noOverflow("vista enfocada");
await page.screenshot({ path: `${out}/v25l-focus.png`, fullPage: true });
log("vista enfocada: solo el paso actual, 15:00, barra de avance");

// 4 · pausa congela, reanudar sigue
await page.clock.fastForward(60_000);
await page.getByText("14:00").waitFor();
await focus.getByRole("button", { name: "Pausar" }).click();
await page.clock.fastForward(5 * 60_000);
await page.waitForTimeout(1200);
if (!(await focus.getByRole("timer").innerText()).startsWith("14:")) errors.push("la pausa no congeló el tiempo");
await focus.getByRole("button", { name: "Reanudar" }).click();
await page.clock.fastForward(14 * 60_000 + 1000);
await focus.getByText("Descanso").first().waitFor();
await page.clock.fastForward(3 * 60_000 + 1000);
await focus.getByRole("button", { name: "Empezar" }).waitFor();
log("pausa/reanudar, foco → descanso → espera");

// 5 · recargar recupera la vista
await page.reload();
await page.getByTestId("micro-focus").waitFor();
log("recargar recupera la vista enfocada");

// 6 · paso hecho avanza
await page.getByTestId("micro-focus").getByRole("button", { name: "Paso hecho" }).click();
await page.getByTestId("micro-focus").getByText(`Paso 3 de ${n}`).waitFor();
await page.getByTestId("micro-focus").getByRole("button", { name: "Salir" }).click();
await list.waitFor();
await noOverflow("lista tras salir");
if (writes() !== before) errors.push(`se escribió en apuntes/flashcards: ${before} → ${writes()}`);
log("«Paso hecho» avanza; no se guardó nada en apuntes ni flashcards");

// 7 · v2.9 N3: terminar todos los pasos guarda la sesión en la BD y se ve desde otro dispositivo
const sessions = () => Number(psql(`select count(*) from "StudyMicroSession" where "userId"='${uid}'`));
const state = await ctx.storageState();
const device = async () => {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, storageState: state, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.182" } });
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(`pageerror otro dispositivo: ${e.message}`));
  await p.goto(B + "/study?tab=steps");
  await p.getByRole("tab", { name: "Pasos" }).and(p.locator('[aria-selected="true"]')).waitFor();
  await p.waitForLoadState("networkidle");
  return { c, p };
};
if (sessions() !== 0) errors.push("había sesiones antes de terminar");
await page.getByRole("button", { name: "Empezar este paso" }).click();
for (let k = 0; k < n; k++) {
  if (await page.getByText(/Terminaste los/).count()) break;
  await page.getByTestId("micro-focus").getByRole("button", { name: "Paso hecho" }).click();
}
await page.getByText(`Terminaste los ${n} pasos`).waitFor();
for (let t = 0; t < 40 && sessions() < 1; t++) await new Promise((r) => setTimeout(r, 250));
if (sessions() !== 1) errors.push(`esperaba 1 sesión en la BD y hay ${sessions()}`);
const row = psql(`select "stepsDone" || '/' || "stepsTotal" || '|' || imported || '|' || "focusMin" from "StudyMicroSession" where "userId"='${uid}'`);
if (row !== `${n}/${n}|false|15`) errors.push(`sesión guardada ${row}, esperaba ${n}/${n}|false|15`);
await page.getByRole("button", { name: "Volver a los pasos" }).click();
await page.getByTestId("micro-history").waitFor();
log("terminar los pasos guarda la sesión en la BD");
{
  const { c, p } = await device();
  await p.getByTestId("micro-history").waitFor();
  if (!(await p.getByTestId("micro-history").innerText()).includes(`${n}/${n} pasos`)) errors.push("el otro dispositivo no ve la sesión completada");
  if (await p.getByTestId("micro-import").count()) errors.push("el otro dispositivo ofrece importar algo que no tiene");
  await c.close();
  log("la sesión se ve desde otro dispositivo");
}

// 8 · importación de lo que había en localStorage: solo lo terminado, una vez, sin borrar nada local antes del 200
{
  const { c, p } = await device();
  const legacy = (done: number[]) => ({
    steps: { title: "Sesión antigua", steps: [1, 2, 3].map((k) => ({ n: k, action: `Paso ${k}`, minutes: 10 })) },
    selected: 0,
    preset: "10/2",
    done,
    run: null,
  });
  // a medias: no se ofrece
  await p.evaluate((v) => localStorage.setItem("atlenza.study.microRun", JSON.stringify(v)), legacy([0, 1]));
  await p.reload();
  await p.getByRole("tab", { name: "Pasos" }).and(p.locator('[aria-selected="true"]')).waitFor();
  await p.getByText("Sesión antigua").first().waitFor();
  if (await p.getByTestId("micro-import").count()) errors.push("se ofrece importar una sesión a medias");
  // terminada: se ofrece; si el guardado falla, no se pierde nada local
  await p.evaluate((v) => localStorage.setItem("atlenza.study.microRun", JSON.stringify(v)), legacy([0, 1, 2]));
  await p.reload();
  await p.getByTestId("micro-import").waitFor();
  await minH(p.getByRole("button", { name: "Importar" }), "«Importar»");
  await p.route("**/api/study/micro-sessions", (r) => (r.request().method() === "POST" ? r.fulfill({ status: 500, contentType: "application/json", body: "{}" }) : r.continue()));
  await p.getByRole("button", { name: "Importar" }).click();
  await p.waitForTimeout(800);
  if (!(await p.evaluate(() => localStorage.getItem("atlenza.study.microRun")))) errors.push("se borró lo local tras un guardado fallido");
  if (sessions() !== 1) errors.push("el guardado fallido escribió en la BD");
  await p.unroute("**/api/study/micro-sessions");
  await p.getByTestId("micro-import").getByRole("button", { name: "Importar" }).click();
  await p.getByTestId("micro-history").getByText("Sesión antigua").waitFor();
  if (sessions() !== 2) errors.push(`tras importar esperaba 2 sesiones y hay ${sessions()}`);
  await p.reload();
  await p.getByRole("tab", { name: "Pasos" }).and(p.locator('[aria-selected="true"]')).waitFor();
  await p.getByTestId("micro-history").waitFor();
  if (await p.getByTestId("micro-import").count()) errors.push("se vuelve a ofrecer lo ya importado");
  if (sessions() !== 2) errors.push("importar dos veces duplicó");
  if ((await p.evaluate(() => document.documentElement.scrollWidth)) > 392) errors.push("histórico de micro-pasos: desborda en horizontal");
  await c.close();
  log("importación: a medias no se ofrece, un fallo no pierde nada local, una sola vez");
}

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v25l");
