// E2E v3.3 E3: cartera de atletas (con y sin cuenta) en un móvil de 390 px.
// Alta de una ficha en una pantalla, lista con búsqueda y filtro, ficha con «Ahora», archivar, «Planificar varios»
// con la ficha, y aislamiento: otra entrenadora y una atleta no ven ni tocan fichas ajenas.
//   BASE_URL=http://localhost:3000 npm run e2e:entrenadora
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import { chromium, type Page } from "playwright-core";

import { a11y, filledActions, hScroll, setLargeHc, smallTargets, WCAG22 } from "./a11y.mjs";

mkdirSync(process.env.SHOTS_DIR ?? "e2e/screenshots", { recursive: true });
const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];
const fail = (m: string) => errors.push(m);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let ipSeq = 140;
const newPage = async () => {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": `198.51.100.${ipSeq++}` } });
  const p = await c.newPage();
  p.on("pageerror", (e) => fail(`pageerror ${p.url()}: ${e.message}`));
  p.on("console", (m) => {
    if (m.type() === "error" && !/40[0134]|409|422/.test(m.text())) fail(`console ${p.url()}: ${m.text()}`);
  });
  p.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 500) fail(`HTTP ${r.status()} ${r.url()}`);
  });
  return p;
};
const go = async (p: Page, u: string) => {
  await p.goto(B + u, { waitUntil: "load" });
  await p.waitForTimeout(300);
};
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
const status = (p: Page, url: string, method = "GET", body?: unknown) =>
  p.evaluate(async ([u, m, b]) => (await fetch(u as string, { method: m as string, headers: { "content-type": "application/json" }, body: b ? JSON.stringify(b) : undefined })).status, [url, method, body] as const);

const run = Date.now();
const mail = (k: string) => `${k}-${run}@e2e.test`;
const pw = { coa: newUser(mail("coa"), "Entrenadora", "COACH"), oth: newUser(mail("oth"), "Otra entrenadora", "COACH"), ath: newUser(mail("ath"), "Atleta", "ATHLETE") };

// 1. Lista vacía y alta en una pantalla
const coa = await newPage();
await login(coa, mail("coa"), pw.coa);
await go(coa, "/coach/athletes");
if (!(await coa.getByTestId("athletes-empty").isVisible())) fail("sin mensaje de lista vacía");
if ((await filledActions(coa)) !== 1) fail(`lista: se esperaba 1 acción rellena y hay ${await filledActions(coa)}`);
const t0 = Date.now();
await coa.getByTestId("new-athlete").click();
const submit = coa.getByRole("button", { name: "Añadir atleta" });
if (!(await submit.isDisabled())) fail("«Añadir atleta» no está desactivado sin conformidad");
await coa.getByLabel("Alias").fill("Atleta Vallas");
await coa.getByLabel("Categoría").fill("Sub-18");
await coa.getByLabel("Disciplina").fill("Vallas");
await coa.getByLabel("Grupo").fill("Tarde");
if (!/nombre real/i.test(await coa.locator("[data-slot=sheet-content]").innerText())) fail("falta el aviso de no escribir el nombre real");
for (const v of await a11y(coa, "alta de ficha (hoja abierta)", WCAG22)) fail(v);
await coa.getByRole("checkbox").check();
await Promise.all([coa.waitForURL(/\/coach\/athletes\/[^/]+$/), submit.click()]);
const fichaId = coa.url().split("/").pop()!;
if (Date.now() - t0 > 60_000) fail("el alta tardó más de 1 minuto");
await coa.getByTestId("ficha-now").waitFor();
if (!/Sin plan activo/.test(await coa.getByTestId("ficha-now").innerText())) fail("la ficha nueva no dice «Sin plan activo»");
log("alta de una ficha en una pantalla");

// 2. Lista: la ficha sale «sin cuenta»; búsqueda y filtro por grupo
await go(coa, "/coach/athletes");
const row = coa.getByTestId("athlete-row").filter({ hasText: "Atleta Vallas" });
if (!/sin cuenta/.test(await row.innerText())) fail("la fila no dice «sin cuenta»");
await coa.fill("#athlete-q", "zzz");
if (!(await coa.getByTestId("athletes-empty").isVisible())) fail("la búsqueda sin resultados no avisa");
await coa.fill("#athlete-q", "vallas");
if ((await coa.getByTestId("athlete-row").count()) !== 1) fail("la búsqueda no encuentra la ficha");
await coa.fill("#athlete-q", "");
await coa.selectOption("#athlete-group", "Tarde");
if ((await coa.getByTestId("athlete-row").count()) !== 1) fail("el filtro por grupo no la deja");
log("lista con búsqueda y filtro");

// 3. Móvil: una acción rellena, ≥ 44 px, sin scroll horizontal, axe, letra grande + contraste alto
for (const u of ["/coach/athletes", `/coach/athletes/${fichaId}`]) {
  await go(coa, u);
  if ((await filledActions(coa)) > 1) fail(`${u}: más de una acción rellena`);
  const bad = await smallTargets(coa, "main", { includeInline: true });
  if (bad.length) fail(`${u}: objetivos < 44 px: ${bad.join(", ")}`);
  if (await hScroll(coa)) fail(`${u}: scroll horizontal`);
  for (const v of await a11y(coa, u, WCAG22)) fail(v);
  await setLargeHc(coa, true);
  await go(coa, u);
  if (await hScroll(coa)) fail(`${u} (letra 130 + hc): scroll horizontal`);
  const bad2 = await smallTargets(coa, "main", { includeInline: true });
  if (bad2.length) fail(`${u} (letra 130 + hc): objetivos < 44 px: ${bad2.join(", ")}`);
  for (const v of await a11y(coa, `${u} (letra 130 + hc)`, WCAG22)) fail(v);
  await setLargeHc(coa, false);
}
log("390 px: una acción principal, ≥ 44 px, letra grande + hc, axe");

// 4. «Planificar» lleva a «Planificar varios» con la ficha como atleta asignable
await go(coa, `/coach/athletes/${fichaId}`);
await coa.getByRole("link", { name: /Planificar/ }).click();
await coa.waitForURL(/\/coach\/multi/);
if (!/Atleta Vallas/.test(await coa.locator("main").innerText())) fail("«Planificar varios» no lista la ficha");
log("la ficha es asignable en «Planificar varios»");

// 5. Aislamiento: otra entrenadora y una atleta
const oth = await newPage();
await login(oth, mail("oth"), pw.oth);
await go(oth, "/coach/athletes");
if (/Atleta Vallas/.test(await oth.locator("main").innerText())) fail("otra entrenadora ve la ficha en su lista");
if ((await (await oth.goto(B + `/coach/athletes/${fichaId}`))?.status()) !== 404) fail("otra entrenadora no recibe 404 en la ficha");
if ((await status(oth, `/api/coach/athletes/${fichaId}`, "PATCH", { archived: true })) !== 404) fail("otra entrenadora puede archivar la ficha");
const ath = await newPage();
await login(ath, mail("ath"), pw.ath);
if ((await status(ath, "/api/coach/athletes")) !== 403) fail("una atleta lee la cartera de entrenadora");
if ((await status(ath, "/api/coach/athletes", "POST", { alias: "x", category: "Sub-18", consent: true })) !== 403) fail("una atleta crea fichas");
await go(ath, "/coach/athletes");
if (new URL(ath.url()).pathname.startsWith("/coach")) fail("una atleta se queda en /coach/athletes");
log("aislamiento: otra entrenadora (404) y atleta (403)");

// 6. Archivar: sale de la lista activa, aparece en «Archivadas» y no en «Planificar varios»
await go(coa, `/coach/athletes/${fichaId}`);
await coa.getByTestId("ficha-data").locator("summary").click();
await coa.getByTestId("ficha-archive").click();
await coa.waitForTimeout(600);
await go(coa, "/coach/athletes");
if ((await coa.locator('ul[aria-label="Atletas"] [data-testid=athlete-row]').filter({ hasText: "Atleta Vallas" }).count()) !== 0) fail("la archivada sigue en la lista activa");
await coa.getByTestId("athletes-archived").locator("summary").click();
if (!(await coa.getByTestId("athletes-archived").getByText("Atleta Vallas").isVisible())) fail("la archivada no aparece en «Archivadas»");
await go(coa, "/coach/multi");
if (/Atleta Vallas/.test(await coa.locator("main").innerText())) fail("la archivada sigue asignable en «Planificar varios»");
log("archivar y reactivar");

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK entrenadora");
