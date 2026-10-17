// E2E de la v2.0 bloque B (planificar varios atletas + «qué pasa si») en un móvil de 390 px.
//   BASE_URL=http://localhost:3000 npm run e2e:v20b
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
let ipSeq = 120;
const newPage = async () => {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": `198.51.100.${ipSeq++}` } });
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(`pageerror ${p.url()}: ${e.message}`));
  p.on("console", (m) => {
    if (m.type() === "error" && !/40[0134]|422/.test(m.text())) errors.push(`console ${p.url()}: ${m.text()}`);
  });
  p.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`);
  });
  return p;
};
const go = async (p: Page, u: string) => {
  await p.goto(B + u, { waitUntil: "load" });
  await p.waitForTimeout(300);
};
const noHScroll = async (p: Page, where: string) => {
  if (await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) errors.push(`scroll horizontal en ${where}`);
};
const call = (p: Page, method: string, url: string, body?: unknown) =>
  p.evaluate(
    async ([m, u, b]) => {
      const r = await fetch(u as string, { method: m as string, headers: { "content-type": "application/json" }, body: b ? JSON.stringify(b) : undefined });
      return { status: r.status, json: await r.json().catch(() => null) };
    },
    [method, url, body] as const,
  );

const user = (...a: string[]) => execFileSync("npm", ["run", "-s", "user", "--", ...a], { encoding: "utf8" });
const newUser = (email: string, name: string, role: string) => {
  const pw = user("create", email, "--name", name, "--role", role, "--accept-terms").match(/Contraseña: (\S+)/)?.[1];
  if (!pw) throw new Error(`no se pudo crear ${email}`);
  return pw;
};
const login = async (p: Page, email: string, pw: string) => {
  await go(p, "/login");
  await p.fill("#email", email);
  await p.fill("#password", pw);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login")), p.click("button[type=submit]")]);
};

const run = Date.now();
const mail = (k: string) => `${k}-${run}@e2e.test`;
const pw = { coa: newUser(mail("coa"), "Entrenadora", "COACH"), a1: newUser(mail("a1"), "Atleta Uno", "ATHLETE"), a2: newUser(mail("a2"), "Atleta Dos", "ATHLETE"), a3: newUser(mail("a3"), "Atleta Tres", "ATHLETE") };

const coa = await newPage();
await login(coa, mail("coa"), pw.coa);
const ath: Record<string, Page> = {};
for (const [k, canPlan] of [["a1", true], ["a2", true], ["a3", false]] as const) {
  await call(coa, "POST", "/api/coach/links", { athleteEmail: mail(k), canPlan: false });
  ath[k] = await newPage();
  await login(ath[k], mail(k), pw[k]);
  const links = (await call(ath[k], "GET", "/api/coach/links")).json as { asAthlete: Array<{ id: string }> };
  const r = await call(ath[k], "PATCH", `/api/coach/links/${links.asAthlete[0].id}`, { status: "ACTIVE", canPlan, scopes: ["SESSIONS", "LOAD", "PLANNING"] });
  if (r.status >= 300) errors.push(`vínculo ${k}: HTTP ${r.status}`);
}
log("coach con tres atletas: dos con canPlan, una sin");

// El plan descarta los días anteriores a «start»: se parte del lunes para que no dependa del día en que corre la prueba
function mondayOfThisWeek() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function nextMonday() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 7 - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

// La entrenadora crea un plan propio, guarda su semana 1 como semana tipo
const plan = await call(coa, "POST", "/api/planning/manual", { name: "Base E2E", start: mondayOfThisWeek(), weeks: 1, weekdays: [0, 2, 4], type: "STRENGTH" });
const code = (plan.json as { code: string }).code;
const days = ((await call(coa, "GET", `/api/planning/manual?code=${code}`)).json as { days: Array<{ id: string }> }).days;
for (const d of days) await call(coa, "PUT", `/api/planning/manual/day/${d.id}`, { title: "Fuerza E2E", durationMin: 60, type: "STRENGTH", notes: "", rows: [] });
const tpl = await call(coa, "POST", `/api/planning/manual/${code}/week-template`, { name: "Semana E2E", week: 1 });
if (tpl.status >= 300) errors.push(`semana tipo: HTTP ${tpl.status}`);

// 1. Selección en 390 px
await go(coa, "/coach/multi");
await coa.getByRole("heading", { name: "Planificar varios atletas" }).waitFor();
if (!(await coa.getByLabel("Atleta Tres").isDisabled())) errors.push("Atleta Tres (sin canPlan) no está deshabilitada");
await coa.getByText("No te ha dado permiso de planificación").waitFor();
await coa.getByLabel("Atleta Uno").check();
await coa.getByLabel("Atleta Dos").check();
await coa.getByLabel("Qué copiar").selectOption({ label: "Semana E2E" });
await coa.locator('input[type="date"]').fill(nextMonday());
await noHScroll(coa, "selección 390 px");
log("selección: la atleta sin canPlan no se puede marcar");

// 2. Previsualización: nada escrito todavía
await coa.getByRole("button", { name: /Previsualizar \(2\)/ }).click();
await coa.getByRole("region", { name: "Previsualización" }).waitFor();
await coa.getByRole("table", { name: "Escenarios de Atleta Uno" }).waitFor();
await coa.getByText("Con la copia").first().waitFor();
await coa.getByRole("img", { name: /Forma \(TSB\)/ }).first().waitFor();
await noHScroll(coa, "previsualización 390 px");
errors.push(...(await a11y(coa, "/coach/multi")));
await coa.screenshot({ path: `${out}/v20b-01-preview.png`, fullPage: true });
log("previsualización con escenarios; sin escrituras");

// 3. Sin confirmar no se puede asignar; el servidor también lo exige
if (!(await coa.getByRole("button", { name: /Asignar a 2/ }).isDisabled())) errors.push("Asignar activo sin confirmar");
const noConfirm = await call(coa, "POST", "/api/coach/multi-plan", { action: "apply", source: { kind: "template", id: "x" }, start: new Date().toISOString().slice(0, 10), athleteIds: [], confirm: false });
if (noConfirm.status !== 422 && noConfirm.status !== 400) errors.push(`apply sin confirm → ${noConfirm.status}`);
await coa.getByLabel(/Confirmo crear un borrador/).check();
await coa.getByRole("button", { name: /Asignar a 2/ }).click();
await coa.getByRole("status").getByText(/Borradores creados: 2/).waitFor();
await coa.screenshot({ path: `${out}/v20b-02-asignado.png`, fullPage: true });
log("asignación tras confirmar");

// 4. Cada atleta con permiso tiene un borrador; la otra, nada
for (const k of ["a1", "a2"]) {
  await go(ath[k], "/planning");
  await ath[k].getByText(/Semana E2E · de Entrenadora/).first().waitFor();
}
await go(ath.a3, "/planning");
if ((await ath.a3.getByText(/Semana E2E/).count()) !== 0) errors.push("la atleta sin canPlan recibió un borrador");
await noHScroll(ath.a1, "planificación atleta 390 px");
log("borradores en las dos atletas con permiso; ninguno en la otra");

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v20b");
