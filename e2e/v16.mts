// E2E de la v1.6 en un móvil de 390 px (app con ALLOW_REGISTRATION=true y LIFEOS_FAKE_AI=1;
// necesita DATABASE_URL para crear cuentas con `npm run user`).
//   BASE_URL=http://localhost:3000 npm run e2e:v16
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import { chromium } from "playwright-core";

const out = process.env.SHOTS_DIR ?? "e2e/screenshots";
mkdirSync(out, { recursive: true });
const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !/404|422/.test(m.text())) errors.push(`console ${page.url()}: ${m.text()}`);
});
page.on("response", (r) => {
  if (r.url().includes("/api/") && r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`);
});
const shot = (n: string) => page.screenshot({ path: `${out}/v16-${n}.png`, fullPage: true });
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
const login = async (email: string, pw: string) => {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES" });
  const p = await c.newPage();
  await p.goto(B + "/login");
  await p.fill("#email", email);
  await p.fill("#password", pw);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login")), p.click("button[type=submit]")]);
  return p;
};

// 1. Registro con perfil de mujer
const myEmail = `v16${Date.now()}@test.dev`;
await go(B + "/register");
await page.fill("#name", "Atleta Prueba");
await page.fill("#email", myEmail);
await page.fill("#password", "contraseña-segura-1");
await Promise.all([page.waitForURL(/\/settings\?welcome=1/), page.click("button[type=submit]")]);
await page.selectOption("#p-sex", "FEMALE");
await page.getByRole("button", { name: "Guardar perfil" }).click();
await toast(/Perfil guardado/);
log("registro y perfil");

// 2. Bloque W: mujeres
// 4 ciclos de 28 días con dolor el día 1: la predicción pasa a ser aprendida
await api("put", "/api/health/cycle", { avgLength: 28, periodDays: 4, lastStart: null, hormonal: "no", symptoms: [], symptomParts: [] });
const start0 = plusDays(madrid, -4 * 28 - 3);
for (let c = 0; c < 5; c++) {
  for (let d = 0; d < 3; d++) {
    const date = plusDays(start0, c * 28 + d);
    if (date <= madrid) await api("post", "/api/health/cycle/log", { date, period: true, symptoms: d === 0 ? ["dolor"] : [] });
  }
}
await go(B + "/recovery/women");
await page.getByText("Próximos días (aprendido de tus ciclos)").waitFor();
log("predicción de síntomas aprendida de 4 ciclos");

await page.getByRole("textbox", { name: "Fracturas de estrés previas" }).fill("2");
await page.getByRole("textbox", { name: "Raciones de calcio al día" }).fill("1");
await page.getByRole("button", { name: "Guardar cribado óseo" }).click();
await toast(/Cribado óseo guardado/);
await page.getByLabel("Avisos de salud").getByText("Salud ósea: pide una valoración").waitFor();
log("salud ósea: cribado con aviso");

await page.getByRole("button", { name: "Crear enlace para tu médica" }).click();
const link = await page.getByLabel("Enlace creado").inputValue();
const anon = await browser.newContext();
const shared = await anon.request.get(link);
if (shared.status() !== 200 || !(await shared.text()).includes("Resumen para tu médica")) errors.push(`informe médico: ${shared.status()}`);
if (!/default-src 'none'/.test(shared.headers()["content-security-policy"] ?? "")) errors.push("informe médico sin CSP estricta");
await page.getByRole("button", { name: "Revocar" }).first().click();
await toast(/Enlace revocado/);
if ((await anon.request.get(link)).status() !== 404) errors.push("informe médico: el enlace revocado sigue abierto");
await anon.close();
await noOverflow("/recovery/women");
await shot("01-women");
log("enlace para la médica: abre sin sesión, CSP estricta y se revoca");

await api("post", "/api/nutrition/entries", { date: madrid, mealType: "LUNCH", customName: "Lentejas", quantityG: 250, kcal: 300, proteinG: 20, carbsG: 45, fatG: 3, ironRich: true });
await go(B + "/nutrition");
if ((await page.getByRole("button", { name: /Quitar «rico en hierro» de Lentejas/ }).getAttribute("aria-pressed")) !== "true") errors.push("hierro: la marca no se ve en Nutrición");
await go(B + "/recovery/women");
await page.getByLabel("Hierro en la dieta").getByText(/1 de 7 días/).waitFor();
log("hierro en la dieta");

const friendEmail = `amiga-v16-${Date.now()}@test.dev`;
const friend = await login(friendEmail, newUser(friendEmail));
await go(B + "/safety");
await page.getByLabel("Email de tu contacto").fill(friendEmail);
await page.getByRole("button", { name: "Invitar" }).click();
await toast(/Invitación enviada/);
await friend.goto(B + "/safety");
await friend.getByLabel("Me tienen de contacto").getByRole("button", { name: "Aceptar" }).click();
await friend.getByText("Aceptado").first().waitFor();
await go(B + "/safety");
await radio("Tiempo hasta la vuelta", "30 min").click();
await page.getByLabel("Dónde (opcional)").fill("Pista");
await page.getByRole("button", { name: "Salgo" }).click();
await toast(/Salida anotada/);
await friend.goto(B + "/safety");
await friend.getByLabel("Salidas de tus contactos").getByText(/Atleta Prueba salió a las/).waitFor();
await page.getByRole("button", { name: "Llegué" }).click();
await toast(/Llegada anotada/);
await noOverflow("/safety");
await shot("02-safety");
await friend.context().close();
log("entreno sola: invitar, aceptar, salir y llegar");

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v16");
