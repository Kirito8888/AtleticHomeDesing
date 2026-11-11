// E2E de la v2.10 bloque 1 (N8: precarga desde la sesión anterior y descanso automático) en un móvil de 390 px.
//   BASE_URL=http://localhost:3000 npm run e2e:v210a
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import { chromium, type Page } from "playwright-core";

import { a11y } from "./a11y.mjs";

const out = process.env.SHOTS_DIR ?? "e2e/screenshots";
mkdirSync(out, { recursive: true });
const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.216" } });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !/40[0134]|422/.test(m.text())) errors.push(`console ${page.url()}: ${m.text()}`);
});
page.on("response", (r) => {
  if (r.url().includes("/api/") && r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`);
});
const go = async (p: Page, u: string) => {
  await p.goto(B + u, { waitUntil: "load" });
  await p.waitForTimeout(300);
};
const noHScroll = async (where: string) => {
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) errors.push(`scroll horizontal en ${where}`);
};

const email = `v210a-${Date.now()}@e2e.test`;
const created = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", "Atleta v210a", "--role", "ATHLETE", "--accept-terms"], { encoding: "utf8" });
const pw = created.match(/Contraseña: (\S+)/)?.[1];
if (!pw) throw new Error("no se pudo crear el usuario");
await go(page, "/login");
await page.fill("#email", email);
await page.fill("#password", pw);
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);

// Sesión anterior por API: sentadilla 2 × (5 × 80 kg) con descanso prescrito de 90 s.
const exercises = (await (await page.request.get(B + "/api/training/exercises")).json()) as Array<{ id: string; name: string }> | { exercises: Array<{ id: string; name: string }> };
const list = Array.isArray(exercises) ? exercises : exercises.exercises;
const squat = list.find((e) => e.name === "Sentadilla trasera");
if (!squat) throw new Error("falta el ejercicio Sentadilla trasera en el catálogo");
const day = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
const r = await page.request.post(B + "/api/training/sessions", {
  data: {
    date: day,
    type: "STRENGTH",
    status: "COMPLETED",
    durationSec: 3600,
    sessionRpe: 7,
    strength: { sets: [0, 1].map(() => ({ exerciseId: squat.id, reps: 5, weightKg: 80, isWarmup: false, restSec: 90 })) },
  },
});
const prevId = ((await r.json().catch(() => ({}))) as { id?: string }).id;
if (!r.ok()) errors.push(`crear sesión anterior: ${r.status()} ${(await r.text()).slice(0, 160)}`);
log("sesión anterior creada por API");

// Nueva sesión: al añadir el ejercicio salen las series de la anterior como referencia.
await go(page, "/training/new");
await page.getByLabel("Buscar ejercicio").fill("sentadilla tr");
await page.getByRole("button", { name: /Sentadilla trasera/ }).click();
await page.getByTestId("prev-summary").getByText(/80×5 · 80×5/).waitFor();
if ((await page.getByRole("textbox", { name: "Peso serie 1" }).inputValue()).replace(",", ".") !== "80" && !(await page.getByRole("textbox", { name: "Peso serie 1" }).inputValue()).startsWith("80")) errors.push("el peso no se precarga");
if (!(await page.getByRole("textbox", { name: "Repeticiones serie 1" }).inputValue()).startsWith("5")) errors.push("las repeticiones no se precargan");
await page.getByTestId("pending-warning").getByText(/2 series de referencia/).waitFor();
await noHScroll("precarga 390 px");
errors.push(...(await a11y(page, "/training/new (precarga)")));
await page.screenshot({ path: `${out}/v210a-01-precarga.png`, fullPage: true });
log("pesos y repeticiones de la sesión anterior precargados como referencia");

// «Hecha» en la serie 1 arranca el descanso prescrito (90 s) y no toca los datos.
await page.getByRole("button", { name: "Hecha serie 1" }).click();
await page.getByTestId("rest-remaining").getByText(/^1:(30|29)$/).waitFor({ timeout: 5000 });
await page.getByTestId("pending-warning").getByText(/1 serie de referencia/).waitFor();
await page.getByRole("button", { name: "Pausar descanso" }).click();
await page.getByRole("button", { name: "+30 s" }).click();
await page.getByRole("button", { name: "Terminar descanso" }).click();
if (!(await page.getByRole("textbox", { name: "Peso serie 1" }).inputValue()).startsWith("80")) errors.push("pausar/cancelar el descanso cambió el peso");
if ((await page.getByRole("button", { name: "Hecha serie 1" }).getAttribute("aria-pressed")) !== "true") errors.push("la serie 1 dejó de estar hecha al cancelar el descanso");
log("«Hecha» arranca el descanso de 90 s; pausar, +30 s y terminar no pierden la serie");

// Se guarda solo lo marcado.
await page.getByRole("textbox", { name: "Peso serie 1" }).fill("82,5");
await page.getByRole("button", { name: /^Guardar sesión$/ }).click();
await page.waitForURL(/\/training\/[a-z0-9]+$/);
const sessions = (await (await page.request.get(`${B}/api/training/sessions?from=${day}&to=${new Date().toISOString().slice(0, 10)}`)).json()) as Array<{ id: string; date: string }>;
const today = sessions.find((x) => x.id !== prevId);
if (!today) throw new Error("no aparece la sesión nueva");
const detail = (await (await page.request.get(`${B}/api/training/sessions/${today.id}`)).json()) as { strength?: { sets: Array<{ weightKg: number; restSec: number | null }> } };
const saved = detail.strength?.sets ?? [];
if (saved.length !== 1 || saved[0].weightKg !== 82.5 || saved[0].restSec !== 90) errors.push(`se guardó ${JSON.stringify(saved)}, se esperaba solo la serie hecha (82,5 kg, 90 s)`);
log("solo se guarda la serie marcada (editable) y conserva el descanso");

await browser.close();
if (errors.length) {
  console.error("\n✘ Fallos:\n" + errors.map((e) => " - " + e).join("\n"));
  process.exit(1);
}
console.log("\nOK v210a");
