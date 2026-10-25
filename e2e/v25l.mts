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

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v25l");
