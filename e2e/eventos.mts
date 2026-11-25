// E2E v3.2 bloque P: asistencia a eventos del club en un móvil de 390 px.
// Un miembro ve los eventos de su club y responde sí/no/quizá en 1 toque; la entrenadora ve el resumen solo de sus
// clubes; la cuota del evento sale pagada/pendiente (OrgFee, sin cobro); nadie ve eventos de otro club.
//   BASE_URL=http://localhost:3000 npm run e2e:eventos
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import { chromium, type Page } from "playwright-core";

import { a11y, filledActions, hScroll, openFolds, setLargeHc, smallTargets, WCAG22 } from "./a11y.mjs";

const out = process.env.SHOTS_DIR ?? "e2e/screenshots";
mkdirSync(out, { recursive: true });
const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];
const fail = (m: string) => errors.push(m);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let ipSeq = 100;
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
const noHScroll = async (p: Page, where: string) => {
  if (await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) fail(`scroll horizontal en ${where}`);
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
const pw = {
  adm: newUser(mail("adm"), "Directora", "COACH"),
  coa: newUser(mail("coa"), "Entrenadora", "COACH"),
  at1: newUser(mail("at1"), "Atleta Uno", "ATHLETE"),
  at2: newUser(mail("at2"), "Atleta Dos", "ATHLETE"),
  oth: newUser(mail("oth"), "Otra directora", "COACH"),
};

// 1. La directora crea el club e invita; los demás aceptan
const adm = await newPage();
await login(adm, mail("adm"), pw.adm);
const clubId: string = await adm.evaluate(async () => (await (await fetch("/api/clubs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Club Eventos E2E" }) })).json()).id);
for (const [k, role] of [["coa", "COACH"], ["at1", "ATHLETE"], ["at2", "ATHLETE"]] as const) {
  const s = await status(adm, `/api/clubs/${clubId}/members`, "POST", { email: mail(k), role });
  if (s >= 300) fail(`invitar ${k}: ${s}`);
}
const accept = async (k: "coa" | "at1" | "at2") => {
  const p = await newPage();
  await login(p, mail(k), pw[k]);
  await go(p, "/clubs");
  await p.getByRole("button", { name: "Aceptar" }).click();
  await p.getByRole("link", { name: /Club Eventos E2E/ }).waitFor();
  return p;
};
const coa = await accept("coa");
const at1 = await accept("at1");
const at2 = await accept("at2");
log("club con directora, entrenadora y dos atletas");

// 2. Otro club con su propio evento (para el aislamiento)
const oth = await newPage();
await login(oth, mail("oth"), pw.oth);
const otherId: string = await oth.evaluate(async () => (await (await fetch("/api/clubs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Club Ajeno E2E" }) })).json()).id);
const when = (days: number, hm: string) => `${new Date(Date.now() + days * 864e5).toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" })}T${hm}`;
if ((await status(oth, `/api/clubs/${otherId}/events`, "POST", { title: "Secreto del otro club", startsAt: when(3, "20:00") })) !== 201) fail("evento del otro club");

// 3. La directora crea un evento con cuota desde la pantalla y la entrenadora otro sin cuota
await go(adm, `/clubs/${clubId}`);
await adm.locator("details", { hasText: "Crear un evento" }).locator("summary").click();
await adm.getByLabel("Título").fill("Entreno conjunto");
await adm.getByLabel("Fecha y hora (Madrid)").fill(when(2, "19:30"));
await adm.getByLabel("Lugar (opcional)").fill("Pista municipal");
await adm.getByLabel(/Cuota por asistente/).fill("10,50");
await adm.getByRole("button", { name: "Crear evento" }).click();
await adm.getByText("Entreno conjunto").first().waitFor();
await go(coa, `/clubs/${clubId}`);
await coa.locator("details", { hasText: "Crear un evento" }).locator("summary").click();
if ((await coa.getByLabel(/Cuota por asistente/).count()) !== 0) fail("la entrenadora ve el campo de cuota");
await coa.getByLabel("Título").fill("Charla técnica");
await coa.getByLabel("Fecha y hora (Madrid)").fill(when(4, "18:00"));
await coa.getByRole("button", { name: "Crear evento" }).click();
await coa.getByText("Charla técnica").first().waitFor();
log("directora (con cuota) y entrenadora (sin cuota) crean eventos");

// 4. La atleta 1 responde «Sí» en UN toque a 390 px; persiste; ve la cuota pendiente
await go(at1, `/clubs/${clubId}`);
const card = at1.locator("li[data-testid^=event-]", { hasText: "Entreno conjunto" });
await card.waitFor();
const group = card.getByRole("group", { name: /Tu respuesta/ });
const buttons = group.getByRole("button");
const sizes = await buttons.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
if (sizes.length !== 3 || sizes.some((h) => h < 44)) fail(`botones de respuesta < 44 px (${sizes})`);
await group.getByRole("button", { name: "Sí" }).tap();
await group.getByRole("button", { name: "Sí", pressed: true }).waitFor();
await at1.waitForTimeout(600);
await go(at1, `/clubs/${clubId}`);
await at1.locator("li[data-testid^=event-]", { hasText: "Entreno conjunto" }).getByRole("button", { name: "Sí", pressed: true }).waitFor();
const feeTxt = await at1.locator("[data-testid^=event-fee-]").first().innerText();
if (!/10,50.*pendiente/.test(feeTxt)) fail(`cuota del evento no sale pendiente: «${feeTxt}»`);
await noHScroll(at1, "eventos atleta 390 px");
errors.push(...(await a11y(at1, "club · eventos (atleta)")));
await at1.screenshot({ path: `${out}/eventos-atleta.png`, fullPage: true });
// cambiar a «Quizá» quita la cuota pendiente
await at1.locator("li[data-testid^=event-]", { hasText: "Entreno conjunto" }).getByRole("button", { name: "Quizá" }).tap();
await at1.locator("li[data-testid^=event-]", { hasText: "Entreno conjunto" }).getByRole("button", { name: "Quizá", pressed: true }).waitFor();
await at1.waitForTimeout(600);
await go(at1, `/clubs/${clubId}`);
if (/pendiente/.test(await at1.locator("[data-testid^=event-fee-]").first().innerText())) fail("«Quizá» no quitó la cuota pendiente");
await at1.locator("li[data-testid^=event-]", { hasText: "Entreno conjunto" }).getByRole("button", { name: "Sí" }).tap();
await at1.locator("li[data-testid^=event-]", { hasText: "Entreno conjunto" }).getByRole("button", { name: "Sí", pressed: true }).waitFor();
await at1.waitForTimeout(600);
log("la atleta responde en 1 toque, persiste y la cuota nace pendiente");

// 5. La directora marca la cuota pagada → la atleta la ve «pagada»
await go(adm, `/clubs/${clubId}`);
await adm.getByRole("button", { name: /Marcar pagada: Entreno conjunto/ }).click();
await adm.getByRole("button", { name: /Marcar pendiente: Entreno conjunto/ }).waitFor();
await go(at1, `/clubs/${clubId}`);
const paidTxt = await at1.locator("[data-testid^=event-fee-]").first().innerText();
if (!/pagada/.test(paidTxt)) fail(`cuota no sale pagada: «${paidTxt}»`);
log("cuota del evento pendiente → pagada");

// 6. La entrenadora ve el resumen; la otra atleta no ve a nadie
await go(coa, `/clubs/${clubId}`);
const sum = await coa.locator("[data-testid^=summary-]").first().innerText();
if (!/Sí 1 · No 0 · Quizá 0 · Sin respuesta 3/.test(sum)) fail(`resumen de la entrenadora: «${sum}»`);
await coa.locator("[data-testid^=summary-]").first().click();
await coa.getByText("Atleta Uno").first().waitFor();
// v3.2 Q: el staff ve cuántas personas recibieron el aviso (sin nombres)
if (!/Recordatorio enviado a \d+/.test(await coa.locator("[data-testid^=reminded-]").first().innerText())) fail("el staff no ve «Recordatorio enviado a N»");
if ((await coa.getByRole("heading", { name: "Cuotas" }).count()) !== 0) fail("la entrenadora ve cuotas");
await noHScroll(coa, "eventos entrenadora 390 px");
errors.push(...(await a11y(coa, "club · eventos (entrenadora)")));
// v3.2 Q: «Añadir al calendario» → .ics con el pie de autoría, sin importe ni datos de salud
await go(at1, `/clubs/${clubId}`);
const icsLink = at1.locator("[data-testid^=event-ics-]").first();
const icsBox = await icsLink.boundingBox();
if (!icsBox || icsBox.height < 44) fail(`enlace del calendario < 44 px (${icsBox?.height})`);
const icsHref = (await icsLink.getAttribute("href"))!;
const icsRes = await at1.evaluate(async (h) => {
  const r = await fetch(h);
  return { type: r.headers.get("content-type"), text: (await r.text()).replace(/\r\n[ \t]/g, "") };
}, icsHref);
if (!/text\/calendar/.test(icsRes.type ?? "") || !icsRes.text.includes("BEGIN:VEVENT")) fail("el .ics del evento no es un calendario");
if (!icsRes.text.includes("X-WR-CALDESC:")) fail("el .ics del evento no lleva el pie de autoría");
if (/10,50|1050|cuota/i.test(icsRes.text)) fail("el .ics del evento lleva el importe");
log("recordatorios (staff ve el recuento) y .ics del evento sin importe y con pie");
await go(at2, `/clubs/${clubId}`);
await at2.locator("li[data-testid^=event-]", { hasText: "Entreno conjunto" }).waitFor();
const at2Text = await at2.locator("#eventos").innerText();
if (/Atleta Uno|Sin respuesta|Sí 1/.test(at2Text)) fail("una atleta ve respuestas o recuentos ajenos");
if ((await at2.locator("li[data-testid^=event-] button[aria-pressed=true]").count()) !== 0) fail("la atleta 2 ve respuestas marcadas ajenas");
log("la entrenadora ve el resumen (sin cuotas); la atleta, solo lo suyo");

// 7. Aislamiento entre clubes: ni página ni API ni respuesta
for (const [who, p] of [["at1", at1], ["coa", coa], ["adm", adm]] as const) {
  const res = await p.goto(B + `/clubs/${otherId}`);
  if (res?.status() !== 404) fail(`${who}: /clubs/{otro} → ${res?.status()}`);
  const g = await status(p, `/api/clubs/${otherId}/events`);
  if (g !== 404) fail(`${who}: GET eventos del otro club → ${g}`);
}
await go(at1, "/clubs");
if (/Secreto del otro club/.test(await at1.locator("body").innerText())) fail("se filtra un evento de otro club");
const sec = await oth.evaluate(async (id) => (await (await fetch(`/api/clubs/${id}/events`)).json()).events[0].id, otherId);
if ((await status(at1, `/api/clubs/${otherId}/events/${sec}/response`, "PUT", { answer: "YES" })) !== 404) fail("responder en un evento de otro club");
if ((await status(at1, `/api/clubs/${clubId}/events/${sec}/response`, "PUT", { answer: "YES" })) !== 404) fail("evento ajeno con mi club");
log("nadie ve ni responde eventos de otro club");

// 8. /clubs avisa de lo pendiente de responder
await go(at2, "/clubs");
await at2.getByText(/2 sin responder/).waitFor();
log("«2 sin responder» en la lista de clubes");

// 9. v3.2 O · rediseño: una acción principal, pliegues cerrados, ≥ 44 px (también enlaces en línea) y ámbitos intactos.
//    Plegar no es control de acceso: se comprueba el HTML completo (no solo el texto visible).
const recheck = async (p: Page, u: string, who: string, max: number) => {
  await go(p, u);
  const n = await filledActions(p);
  if (n > max) fail(`${who} ${u}: ${n} acciones rellenas (máx. ${max})`);
  if (await openFolds(p)) fail(`${who} ${u}: pliegues abiertos por defecto`);
  const bad = await smallTargets(p, "main", { includeInline: true });
  if (bad.length) fail(`${who} ${u}: objetivos < 44 px: ${bad.join(", ")}`);
  if (await hScroll(p)) fail(`${who} ${u}: scroll horizontal`);
  for (const v of await a11y(p, `${who} ${u}`, WCAG22)) fail(v);
};
// atleta 2 (sin responder): tarjeta «Ahora» con «Responder», nada de otras personas en el HTML
await go(at2, `/clubs/${clubId}`);
await at2.getByTestId("club-now").waitFor();
const at2Html = await at2.locator("main").innerHTML();
if (/Atleta Uno|Sin respuesta|Cuotas del club|id="miembros"|id="alertas"|Recordatorio enviado/.test(at2Html)) fail("O: el HTML de la atleta 2 contiene datos de otras personas o del staff");
await recheck(at2, `/clubs/${clubId}`, "atleta", 1);
await recheck(at2, "/clubs", "atleta", 0);
// entrenadora y directora: el «Ahora» lleva el resumen, sin botón relleno; la entrenadora sigue sin cuotas
await recheck(coa, `/clubs/${clubId}`, "entrenadora", 0);
if (/id="cuotas"|Apunte contable/.test(await coa.locator("main").innerHTML())) fail("O: la entrenadora tiene la sección de cuotas en el HTML");
await recheck(adm, `/clubs/${clubId}`, "directora", 0);
await recheck(coa, "/clubs", "entrenadora", 0);
await recheck(coa, "/coach", "entrenadora", 0);
await recheck(coa, "/coach/multi", "entrenadora", 1);
// letra grande + contraste alto
for (const [who, p, u] of [["atleta", at2, `/clubs/${clubId}`], ["entrenadora", coa, `/clubs/${clubId}`], ["entrenadora", coa, "/coach"]] as const) {
  await setLargeHc(p, true);
  await go(p, u);
  const bad = await smallTargets(p, "main", { includeInline: true });
  if (bad.length) fail(`${who} ${u} (letra 130 + hc): objetivos < 44 px: ${bad.join(", ")}`);
  if (await hScroll(p)) fail(`${who} ${u} (letra 130 + hc): scroll horizontal`);
  for (const v of await a11y(p, `${who} ${u} (letra 130 + hc)`, WCAG22)) fail(v);
  await setLargeHc(p, false);
}
// el otro club sigue en 404 tras el cambio visual
if ((await (await at2.goto(B + `/clubs/${otherId}`))?.status()) !== 404) fail("O: /clubs/{otro} ya no da 404");
log("O: una acción principal, pliegues cerrados, ≥ 44 px, letra grande + hc y ámbitos intactos");

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK eventos");
