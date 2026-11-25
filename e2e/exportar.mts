// E2E del Bloque N de v3.2 (V3-N06 exportación guiada + V3-L02 p5 pie de autoría) en un móvil de 390 px (build de producción y DATABASE_URL).
//   BASE_URL=http://localhost:3000 npm run e2e:exportar
// 1) Privacidad: módulos con «Qué incluye», lo cifrado aparte y desmarcado, objetivos ≥ 44 px, sin desbordes
// 2) Solo «Finanzas»: el JSON no lleva entreno ni recuperación y sí el pie · 3) Lo cifrado solo si se marca (con aviso)
// 4) Nada de otras personas (correo, nombre y texto de la entrenadora) · 5) .ics, informe compartido e informe de salud con el pie
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

import { chromium } from "playwright-core";

import { a11y } from "./a11y.mjs";
import { AUTHORSHIP_NOTICE } from "../src/lib/legal/notice";

const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, acceptDownloads: true, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.191" } });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
const noOverflow = async (where: string) => {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  if (w > 392) errors.push(`${where}: desborda en horizontal (${w}px)`);
};
const minH = async (loc: ReturnType<typeof page.locator>, what: string) => {
  const h = (await loc.boundingBox())?.height ?? 0;
  if (h < 44) errors.push(`${what} mide ${h}px (< 44)`);
};

const t = Date.now();
const email = `exportar${t}@test.dev`;
const coachEmail = `exportar-coach${t}@test.dev`;
const coachName = "Entrenadora Secreta E2E";
const create = (mail: string, name: string, role: string) => {
  const pw = execFileSync("npm", ["run", "-s", "user", "--", "create", mail, "--name", name, "--role", role, "--accept-terms"], { encoding: "utf8" }).match(/Contraseña: (\S+)/)?.[1];
  if (!pw) throw new Error("no se pudo crear la cuenta");
  return pw;
};
const pw = create(email, "Atleta Exporta", "ATHLETE");
create(coachEmail, coachName, "COACH");
await page.goto(B + "/login");
await page.fill("#email", email);
await page.fill("#password", pw);
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);

const dbUrl = (process.env.DATABASE_URL ?? "").replace(/\?.*/, "");
const psql = (sql: string) => execFileSync("psql", [dbUrl, "-Atqc", sql], { encoding: "utf8" }).trim();
const uid = psql(`select id from "User" where email='${email}'`);
const coachId = psql(`select id from "User" where email='${coachEmail}'`);
const madridDay = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
const post = async (url: string, data: unknown) => {
  const r = await page.request.post(B + url, { data });
  if (!r.ok()) errors.push(`POST ${url} → ${r.status()} ${(await r.text()).slice(0, 120)}`);
  return r;
};

// Datos: una cuenta, un ánimo (cifrado), una vinculación y un comentario ajeno con texto reconocible
await post("/api/finance/accounts", { name: "Banco Exporta", type: "ASSET", openingBalanceCents: 100000 });
await post("/api/recovery/wellbeing", { kind: "MOOD", date: madridDay, mood: 4, stress: 2 });
psql(`insert into "CoachAthlete"(id,"coachId","athleteId",status,"createdAt") values ('exp${t}','${coachId}','${uid}','ACTIVE',now())`);
psql(`insert into "SessionComment"(id,"sessionId","athleteId","authorId",body,"createdAt") values ('expc${t}','s-${t}','${uid}','${coachId}','Texto privado de la entrenadora ${t}',now())`);
psql(`insert into "SessionComment"(id,"sessionId","athleteId","authorId",body,"createdAt") values ('expm${t}','s-${t}','${uid}','${uid}','Mi propia respuesta ${t}',now())`);

/** Descarga lo que dé el enlace de «Descargar» y devuelve el texto. */
const download = async (): Promise<string> => {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-download").tap()]);
  const path = await dl.path();
  return readFileSync(path, "utf8");
};

// 0 · Ajustes lleva a la exportación guiada
await page.goto(B + "/settings");
const link = page.getByRole("link", { name: /Exportar mis datos/ });
await link.waitFor();
if (!(await link.getAttribute("href"))?.includes("/settings/privacy#exportar")) errors.push("Ajustes no enlaza a la exportación guiada");

// 1 · Pantalla
await page.goto(B + "/settings/privacy#exportar");
const box = page.getByTestId("guided-export");
await box.waitFor();
const mods = box.getByRole("list", { name: "Módulos a exportar" }).getByRole("checkbox");
const total = await mods.count();
if (total !== 8) errors.push(`debía haber 8 módulos y hay ${total}`);
for (let i = 0; i < total; i++) if (!(await mods.nth(i).isChecked())) errors.push(`el módulo ${i + 1} no viene marcado`);
const sens = box.getByRole("checkbox", { name: /datos de salud cifrados/ });
if (await sens.isChecked()) errors.push("lo cifrado viene marcado por defecto");
if (await page.getByTestId("sensitive-warning").count()) errors.push("el aviso de lo cifrado se ve sin marcarlo");
// «Qué incluye» se despliega y dice qué lleva
await box.getByText("Qué incluye Finanzas").tap();
await box.getByText("Cuentas, categorías y movimientos").waitFor({ timeout: 5000 }).catch(() => errors.push("«Qué incluye Finanzas» no se despliega"));
// Objetivos táctiles ≥ 44 px
for (const [what, loc] of [
  ["casilla de módulo (etiqueta)", box.locator("label").first()],
  ["«Qué incluye»", box.locator("summary").first()],
  ["«Todo»", box.getByRole("button", { name: "Todo" })],
  ["«Nada»", box.getByRole("button", { name: "Nada" })],
  ["casilla de lo cifrado (etiqueta)", box.locator("label", { hasText: "datos de salud cifrados" })],
  ["«Descargar»", page.getByTestId("export-download")],
] as const) await minH(loc, what);
await noOverflow("privacidad");
errors.push(...(await a11y(page, "exportación guiada")));
log("pantalla: 8 módulos, qué incluye, lo cifrado aparte y desmarcado, ≥ 44 px");

// 2 · Solo «Finanzas»
await box.getByRole("button", { name: "Nada" }).tap();
const disabled = box.getByText("Descargar (elige algo)");
if ((await disabled.getAttribute("aria-disabled")) !== "true") errors.push("sin módulos el botón no queda desactivado");
await box.getByRole("checkbox", { name: "Finanzas" }).check();
const finText = await download();
const fin = JSON.parse(finText);
if (!fin.finance?.accounts?.length) errors.push("«Finanzas» sin cuentas");
for (const k of ["training", "recovery", "nutrition", "study", "coach", "clubs", "planning"]) if (k in fin) errors.push(`solo Finanzas, pero lleva «${k}»`);
if (fin.notice !== AUTHORSHIP_NOTICE) errors.push("la exportación no lleva el pie de autoría exacto");
if (!fin.user?.email || !fin.security || !fin.privacy) errors.push("la cuenta debe ir siempre");
if (fin.selection?.sensitive !== false) errors.push("la selección no anota que no hay lo cifrado");
log("solo Finanzas: sin lo demás, con la cuenta y el pie");

// 3 · Lo cifrado solo si se marca
await box.getByRole("button", { name: "Todo" }).tap();
const allText = await download();
if (/wellbeing/.test(allText)) errors.push("lo cifrado sale sin pedirlo");
await sens.check();
await page.getByTestId("sensitive-warning").waitFor({ timeout: 5000 }).catch(() => errors.push("marcar lo cifrado no muestra el aviso"));
const sensText = await download();
const withSens = JSON.parse(sensText);
if (!withSens.recovery?.wellbeing?.length) errors.push("con lo cifrado marcado no sale el bienestar");
if (withSens.selection?.sensitive !== true) errors.push("la selección no anota lo cifrado");
log("lo cifrado: fuera por defecto, dentro solo si se marca y con aviso");

// 4 · Nada de otras personas
for (const [label, txt] of [["con lo cifrado", sensText], ["sin lo cifrado", allText]] as const) {
  if (txt.includes(coachEmail)) errors.push(`${label}: sale el correo de la entrenadora`);
  if (txt.includes(coachName)) errors.push(`${label}: sale el nombre de la entrenadora`);
  if (txt.includes(`Texto privado de la entrenadora ${t}`)) errors.push(`${label}: sale el comentario de la entrenadora`);
  if (!txt.includes(`Mi propia respuesta ${t}`)) errors.push(`${label}: falta mi propio comentario`);
}
if (!JSON.parse(allText).coach?.links?.some((l: { myRole?: string }) => l.myRole === "ATHLETE")) errors.push("falta mi vínculo (solo papel y estado)");
const bad = await page.request.get(B + "/api/account/export?modules=finance,otra");
if (bad.status() !== 400) errors.push(`módulo desconocido debía dar 400 y dio ${bad.status()}`);
log("nada de terceros: sin correo, nombre ni texto de la entrenadora");

// 5 · Pie de autoría en el resto de exportaciones (.ics, informe compartido, informe de salud)
const path = (u: string) => new URL(u).pathname;
const feed = (await (await post("/api/calendar/feed", {})).json()) as { url: string };
const ics = (await (await page.request.get(B + path(feed.url))).text()).replace(/\r\n[ \t]/g, "");
if (!ics.includes(`X-WR-CALDESC:${AUTHORSHIP_NOTICE}`)) errors.push(".ics sin el pie de autoría");
const rep = (await (await post("/api/reports", { from: madridDay, to: madridDay })).json()) as { url: string };
const repHtml = await (await page.request.get(B + path(rep.url))).text();
if (!repHtml.includes(AUTHORSHIP_NOTICE)) errors.push("informe compartido sin el pie de autoría");
const hr = (await (await post("/api/health/reports", { kind: "PHYSIO" })).json()) as { url: string };
const hrHtml = await (await page.request.get(B + path(hr.url))).text();
if (!hrHtml.includes(AUTHORSHIP_NOTICE)) errors.push("informe de salud sin el pie de autoría");
for (const [what, txt] of [[".ics", ics], ["informe compartido", repHtml], ["informe de salud", hrHtml]] as const) if (/localhost|127\.0\.0\.1|198\.51\.100/.test(txt.replace(/X-WR-CALNAME[^\n]*/, ""))) errors.push(`${what} lleva datos de la instalación`);
log(".ics, informe compartido e informe de salud con el pie, sin datos de la instalación");

await browser.close();
if (errors.length) {
  console.error("✖", errors.join("\n✖ "));
  process.exit(1);
}
console.log("OK e2e:exportar");
