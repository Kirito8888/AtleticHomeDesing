// E2E del bloque «¿Cómo fue la semana?» propone, no aplica, en un móvil de 390 px (app con ALLOW_REGISTRATION=true y LIFEOS_FAKE_AI=1; necesita DATABASE_URL).
//   BASE_URL=http://localhost:3000 npm run e2e:v25c
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import { chromium } from "playwright-core";

const out = process.env.SHOTS_DIR ?? "e2e/screenshots";
mkdirSync(out, { recursive: true });
const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.174" } });
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
  const h = (await loc.boundingBox())!.height;
  if (h < 44) errors.push(`${what} mide ${h}px (< 44)`);
};

const email = `v25c${Date.now()}@test.dev`;
const out1 = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", "Amiga", "--role", "ATHLETE", "--accept-terms"], { encoding: "utf8" });
const pw = out1.match(/Contraseña: (\S+)/)?.[1];
if (!pw) throw new Error("no se pudo crear la cuenta");
await page.goto(B + "/login");
await page.fill("#email", email);
await page.fill("#password", pw);
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);

// Plan de 4 semanas que empieza el lunes pasado: la semana 1 ya terminó y la 2 está en curso.
// «Hoy» en Europe/Madrid, como la app (en UTC fallaba el domingo por la noche: ya es lunes en Madrid).
const madridToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
const mon = new Date(`${madridToday}T00:00:00Z`);
mon.setUTCDate(mon.getUTCDate() - ((mon.getUTCDay() + 6) % 7) - 7);
const startDate = mon.toISOString().slice(0, 10);
const post = async (url: string, body: unknown) => {
  const r = await page.request.post(B + url, { data: body });
  if (!r.ok()) throw new Error(`${url} → ${r.status()} ${await r.text()}`);
  return r.json();
};
const gen = (await post("/api/ai-plan", {
  goal: "fuerza", discipline: "general", level: "intermedio", ageBand: "18-29", weekdays: [1, 3, 5], minutes: 60, weeks: 4, startDate,
  dayLocations: ["gimnasio", "casa", "casa"], equipment: ["gomas"], intensity: "media", style: "series",
})) as { code: string };
await post(`/api/ai-plan/${gen.code}/activate`, {});

const dbUrl = (process.env.DATABASE_URL ?? "").replace(/\?.*/, "");
const psql = (sql: string) => execFileSync("psql", [dbUrl, "-Atqc", sql], { encoding: "utf8" }).trim();
const uid = psql(`select id from "User" where email='${email}'`);
const week2 = async () => psql(`select id, mode, "updatedAt", md5(content::text) from "PlanDay" where "userId"='${uid}' and week=2 order by key`);
const before = await week2();

await page.goto(`${B}/planning/meso/${gen.code}`);
await page.getByText("¿Cómo fue la semana 1?").waitFor();
await page.getByRole("radio", { name: "Demasiado dura", exact: true }).click();
await page.getByRole("radiogroup", { name: "Dolor" }).getByRole("radio", { name: "4", exact: true }).click();
const send = page.getByRole("button", { name: "Enviar valoración" });
await minH(send, "«Enviar valoración»");
await send.click();

const panel = page.getByRole("region", { name: "Cambios propuestos para la semana 2" });
await panel.waitFor();
await panel.getByText(/Pasa a la versión suave/).first().waitFor();
await panel.getByText(/→/).first().waitFor();
await noOverflow("/planning/meso (propuesta)");
await page.screenshot({ path: `${out}/v25c-proposal.png`, fullPage: true });
if ((await week2()) !== before) errors.push("el plan cambió al enviar, antes de pulsar «Aplicar»");
log("enviada la valoración: se ve la propuesta y el plan no cambia");

await page.reload();
await panel.waitFor();
if ((await week2()) !== before) errors.push("el plan cambió al recargar");

const apply = panel.getByRole("button", { name: "Aplicar cambios" });
await minH(apply, "«Aplicar cambios»");
await apply.click();
await panel.waitFor({ state: "detached" });
const after = await week2();
if (after === before) errors.push("«Aplicar» no cambió el plan");
const notLight = psql(`select count(*) from "PlanDay" where "userId"='${uid}' and week=2 and mode is distinct from 'LIGHT'`);
if (notLight !== "0") errors.push("la semana 2 no pasó a versión suave");
log("«Aplicar cambios» escribe el plan");

await page.reload();
if (await panel.count()) errors.push("la propuesta reaparece tras aplicar");
if ((await week2()) !== after) errors.push("el plan cambió tras recargar");
await noOverflow("/planning/meso (tras aplicar)");

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v25c");
