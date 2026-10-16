// E2E de la v2.1 bloque 3 (curvas citadas y protocolos de fisio compartidos) en un móvil de 390 px.
//   BASE_URL=http://localhost:3000 npm run e2e:v21c
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
let ipSeq = 100 + (Date.now() % 100);
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
const newUser = (email: string, name: string, role: string) => {
  const out = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", name, "--role", role, "--accept-terms"], { encoding: "utf8" });
  const pw = out.match(/Contraseña: (\S+)/)?.[1];
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
const pw = { adm: newUser(mail("adm"), "Admin v21c", "ADMIN"), coa: newUser(mail("coa"), "Fisio v21c", "COACH"), at: newUser(mail("at"), "Atleta v21c", "ATHLETE"), ot: newUser(mail("ot"), "Otra v21c", "ATHLETE") };

// --- La administración da de alta una curva global, con su cita, desde el formulario móvil
const adm = await newPage();
await login(adm, mail("adm"), pw.adm);
await go(adm, "/training/tests/curvas");
await noHScroll(adm, "catálogo vacío 390 px");
await adm.fill("#cf-title", "CMJ chicas de prueba");
await adm.selectOption("#cf-sex", "FEMALE");
await adm.fill("#cf-study", "Estudio de prueba E2E");
await adm.fill("#cf-authors", "Autora A, Autor B");
await adm.fill("#cf-year", "2020");
await adm.fill("#cf-citation", "Autora A, Autor B (2020). Estudio de prueba E2E. Revista de prueba, 1(1), 1-10.");
await adm.fill("#cf-doi", "10.1234/e2e.2020.1");
await adm.fill("#cf-points", "14;40;36;44\n16;48;42;54");
await adm.getByRole("button", { name: "Guardar curva" }).click();
await adm.getByText("CMJ chicas de prueba").first().waitFor();
// sin cita no se guarda (validación de servidor)
const bad = await call(adm, "POST", "/api/training/reference-curves", { testKey: "cmj", unit: "cm", higherIsBetter: true, title: "Sin cita", study: "x y z", authors: "A B", year: 2020, citation: "", points: [{ x: 1, p50: 1 }, { x: 2, p50: 2 }] });
if (bad.status !== 422 && bad.status !== 400) errors.push(`curva sin cita aceptada: HTTP ${bad.status}`);
await noHScroll(adm, "catálogo 390 px");
log("curva global con cita guardada; sin cita se rechaza");

// --- La atleta registra dos tests y los compara
const at = await newPage();
await login(at, mail("at"), pw.at);
const d = new Date();
const birth = `${d.getUTCFullYear() - 15}-01-01`;
const iso = (dt: Date) => dt.toISOString().slice(0, 10);
await call(at, "PATCH", "/api/profile", { birthDate: birth, sex: "FEMALE" });
await call(at, "POST", "/api/training/tests", { test: "cmj", value: 40, date: iso(new Date(d.getTime() - 200 * 86_400_000)) });
await call(at, "POST", "/api/training/tests", { test: "cmj", value: 47, date: iso(d) });
await go(at, "/training/tests");
await at.getByRole("link", { name: "Comparar", exact: true }).click();
await at.waitForURL(/\/training\/tests\/comparar/);
await at.getByTestId("curve-summary").waitFor();
await at.getByTestId("curve-citation").getByText("Autora A, Autor B (2020)", { exact: true }).waitFor();
await at.getByRole("link", { name: "10.1234/e2e.2020.1" }).waitFor();
await at.getByRole("figure", { name: /Comparativa con la curva/ }).waitFor();
await noHScroll(at, "comparativa 390 px");
await at.screenshot({ path: `${out}/v21c-01-comparativa.png`, fullPage: true });
log("comparativa: gráfica, resumen y cita con DOI a 390 px");

// --- La fisio crea un protocolo y lo comparte (vínculo con ámbito RECOVERY)
const coa = await newPage();
await login(coa, mail("coa"), pw.coa);
for (const k of ["at", "ot"]) await call(coa, "POST", "/api/coach/links", { athleteEmail: mail(k), canPlan: false });
const ot = await newPage();
await login(ot, mail("ot"), pw.ot);
for (const [p, scopes] of [[at, ["RECOVERY", "LOAD"]], [ot, ["LOAD"]]] as const) {
  const links = (await call(p, "GET", "/api/coach/links")).json as { asAthlete: Array<{ id: string }> };
  const r = await call(p, "PATCH", `/api/coach/links/${links.asAthlete[0].id}`, { status: "ACTIVE", canPlan: false, scopes });
  if (r.status >= 300) errors.push(`vínculo: HTTP ${r.status}`);
}
await go(coa, "/recovery/fisio");
await coa.locator("details", { hasText: "Nuevo protocolo" }).locator("summary").click();
await coa.fill("#pp-title", "Tobillo E2E");
await coa.fill("#pp-phases", "# 1 · Calmar | dolor máx 2 | Bajar la inflamación\n- Isométricos de tobillo: 5×30 s\n? Sin dolor en reposo\n? Movilidad completa\n\n# 2 · Fuerza | dolor máx 3\n- Elevaciones de talón: 3×12\n? Fuerza simétrica");
await coa.getByRole("button", { name: "Crear protocolo" }).click();
await coa.waitForURL(/\/recovery\/fisio\/[^/]+$/);
const protoId = coa.url().split("/").pop()!;
await coa.getByLabel("Atleta").selectOption({ label: "Atleta v21c" });
await coa.getByRole("button", { name: "Compartir" }).click();
await coa.getByRole("list", { name: "Compartido con" }).getByText("Atleta v21c").waitFor();
// la atleta sin ámbito RECOVERY no aparece como opción y la API lo rechaza
const optNames = await coa.locator("#share-athlete option").allTextContents();
if (optNames.some((t) => t.includes("Otra v21c"))) errors.push("se ofrece compartir a una atleta sin ámbito RECOVERY");
const deny = await call(coa, "POST", `/api/recovery/physio/${protoId}/shares`, { athleteId: ((await call(ot, "GET", "/api/profile")).json as { id: string }).id });
if (deny.status !== 403) errors.push(`compartir sin ámbito → ${deny.status}`);
await noHScroll(coa, "protocolo (entrenadora) 390 px");
await coa.screenshot({ path: `${out}/v21c-02-fisio-entrenadora.png`, fullPage: true });
log("protocolo creado y compartido; sin ámbito RECOVERY → 403");

// --- La atleta ve las fases y marca un criterio
await go(at, "/recovery/fisio");
await at.getByRole("link", { name: /Tobillo E2E/ }).click();
await at.waitForURL(/\/recovery\/fisio\/compartido\//);
await at.getByRole("heading", { name: /1 · Calmar/ }).waitFor();
await at.getByRole("heading", { name: /2 · Fuerza/ }).waitFor();
await at.getByText("Isométricos de tobillo").waitFor();
await at.getByLabel("Sin dolor en reposo").check();
await at.getByTestId("physio-progress").getByText(/1\/3 criterios/).waitFor();
await at.selectOption("#pain-today", "1");
await at.getByText(/Dentro del máximo/).waitFor();
if ((await at.locator("textarea").count()) > 0) errors.push("la atleta ve un editor del protocolo");
await noHScroll(at, "protocolo (atleta) 390 px");
await at.screenshot({ path: `${out}/v21c-03-fisio-atleta.png`, fullPage: true });
const edit = await call(at, "PATCH", `/api/recovery/physio/${protoId}`, { title: "hack" });
if (edit.status !== 403) errors.push(`la atleta edita el protocolo → ${edit.status}`);
const other = await call(ot, "GET", `/api/recovery/physio/shared/${at.url().split("/").pop()}`);
if (other.status !== 404) errors.push(`otra atleta ve el compartido → ${other.status}`);
log("la atleta ve fases, marca un criterio y el dolor; no edita; la ajena no lo ve");

// --- La fisio ve el avance; si la atleta limita el tratamiento, queda bloqueado
await go(coa, `/recovery/fisio/${protoId}`);
await coa.getByText(/1\/3 criterios/).waitFor();
await coa.getByText(/dolor hoy 1\/10/).waitFor();
log("la entrenadora ve el avance de la atleta");

// Limitación del tratamiento (art. 18): la fisio queda bloqueada; la atleta sigue viendo lo suyo
await call(at, "POST", "/api/account/privacy", { restrict: true });
await go(coa, `/recovery/fisio/${protoId}`);
await coa.getByText(/Sin acceso: la atleta ha limitado/).waitFor();
if (await coa.getByText(/1\/3 criterios/).count()) errors.push("con tratamiento limitado la fisio sigue viendo el avance");
const shareBlocked = await call(coa, "POST", `/api/recovery/physio/${protoId}/shares`, { athleteId: ((await call(at, "GET", "/api/profile")).json as { id: string }).id });
if (shareBlocked.status !== 403) errors.push(`compartir con tratamiento limitado → ${shareBlocked.status}`);
await go(at, "/recovery/fisio");
await at.getByRole("link", { name: /Tobillo E2E/ }).waitFor();
await call(at, "POST", "/api/account/privacy", { restrict: false });
await noHScroll(coa, "protocolo bloqueado 390 px");
await coa.screenshot({ path: `${out}/v21c-04-fisio-bloqueado.png`, fullPage: true });
log("con la limitación activa la fisio queda bloqueada y la atleta conserva su vista");

errors.push(...(await a11y(at, "protocolo compartido")), ...(await a11y(coa, "protocolo fisio")));
await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v21c");
