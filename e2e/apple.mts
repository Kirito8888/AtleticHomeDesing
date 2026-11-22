// Apple Fitness (v3.1) a 390 px: token en Ajustes, envío con Bearer (idempotente), bandeja en /training comparada con una sesión del día,
// completar / crear aparte / descartar, y aislamiento (la entrenadora vinculada no ve lo creado aparte, sí lo completado). Datos sintéticos.
//   BASE_URL=http://localhost:3000 npm run e2e:apple
import { execFileSync } from "node:child_process";

import { chromium, type BrowserContext, type Page } from "playwright-core";

const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];
const need = (ok: boolean, msg: string) => { if (!ok) errors.push(msg); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const mkCtx = (ip: string) => browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": ip } });
const newUser = (email: string, name: string, role: string) => {
  const o = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", name, "--role", role, "--accept-terms"], { encoding: "utf8" });
  const pw = o.match(/Contraseña: (\S+)/)?.[1];
  if (!pw) throw new Error(`no se pudo crear ${email}`);
  return pw;
};
const login = async (ctx: BrowserContext, email: string, pw: string): Promise<Page> => {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(`pageerror ${p.url()}: ${e.message}`));
  await p.goto(B + "/login", { waitUntil: "load" });
  await p.waitForTimeout(4000); // hidratar antes de enviar el formulario
  await p.fill("#email", email);
  await p.fill("#password", pw);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login")), p.click("button[type=submit]")]);
  return p;
};

const stamp = Date.now();
const athleteEmail = `apple-${stamp}@e2e.test`;
const ctx = await mkCtx("198.51.100.81");
const p = await login(ctx, athleteEmail, newUser(athleteEmail, "Atleta Apple", "ATHLETE"));
const noHScroll = async (tag: string) => need(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), `scroll horizontal (${tag})`);

// Hoy en Madrid y horas en UTC dentro de ese día (07:00Z ≈ 08–09 h)
const todayMadrid = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
const at = (hhmm: string) => `${todayMadrid}T${hhmm}:00Z`;

// 0) Sesión propia del día (la «web»): 44 min, 5 km, sin FC ni kcal
const created = await p.request.post(B + "/api/training/sessions", { data: { date: todayMadrid, type: "TRACK", status: "COMPLETED", title: "Rodaje web", durationSec: 2640, track: { modality: "RUN", distanceM: 5000, hrZoneSeconds: [], intervals: [] } } });
need(created.ok(), `crear sesión web: ${created.status()}`);
const createdBody = (await created.json()) as { id: string; userId: string };
const webId = createdBody.id;
const me = createdBody.userId;

// 1) Ajustes: generar token, guía y plantilla
await p.goto(B + "/settings#apple-fitness", { waitUntil: "load" });
await p.waitForTimeout(1500);
await p.getByTestId("apple-token-create").click();
await p.getByTestId("apple-token-fresh").waitFor();
const token = (await p.getByTestId("apple-token-value").innerText()).trim();
need(/^[A-Za-z0-9_-]{43}$/.test(token), "formato del token");
await p.getByText("Cómo configurar el Atajo").click();
need(await p.getByText("Plantilla JSON del cuerpo").isVisible(), "no se ve la plantilla JSON");
await noHScroll("ajustes");
log("token generado y guía visible");

// 2) Envío: sin token 401, con token 200, reenvío = duplicado, nada entra en el diario
const send = (body: unknown, tok?: string) => ctx.request.post(B + "/api/training/apple-fitness", { data: body, headers: tok ? { authorization: `Bearer ${tok}` } : {} });
const w1 = { type: "Running", name: "Rodaje reloj", start: at("07:00"), end: at("07:45"), distanceKm: 7.2, kcal: 480, hrAvg: 148, hrMax: 171 };
need((await send(w1)).status() === 401, "sin token debe dar 401");
need((await send(w1, "a".repeat(43))).status() === 401, "token inventado debe dar 401");
const r1 = await send(w1, token);
need(r1.status() === 200 && (await r1.json()).added === 1, `envío: ${r1.status()}`);
const r2 = await send({ ...w1, type: "Correr" }, token);
need((await r2.json()).duplicates === 1, "el reenvío (otro idioma) debe ser duplicado");
need((await send({ ...w1, hrAvg: 999 }, token)).status() === 400, "FC absurda debe dar 400");
log("endpoint: 401/200/duplicado/400");

// 3) /training: bandeja comparada con la sesión del día
await p.goto(B + "/training", { waitUntil: "load" });
await p.waitForTimeout(1500);
await p.getByTestId("apple-inbox").waitFor();
need((await p.getByTestId("apple-item").count()) === 1, "debe haber 1 borrador");
const dist = await p.getByTestId("apple-row-distance").innerText();
need(/5/.test(dist) && /7[,.]2/.test(dist), `comparativa de distancia: ${dist}`);
need(/se completa/.test(await p.getByTestId("apple-row-hrAvg").innerText()), "la FC debe marcarse «se completa»");
need(!/se completa/.test(await p.getByTestId("apple-row-distance").innerText()), "la distancia ya escrita no se pisa");
await noHScroll("bandeja");
const sheetBox = await p.getByTestId("apple-inbox").boundingBox();
need(!!sheetBox && sheetBox.x + sheetBox.width <= 390 + 1, "la bandeja se sale de 390 px");
for (const id of ["apple-merge", "apple-import", "apple-discard"]) {
  const bb = await p.getByTestId(id).boundingBox();
  need(!!bb && bb.height >= 44, `${id}: botón < 44 px`);
}
// Un borrador aún no es del diario ni de nadie más
await p.getByTestId("apple-merge").click();
await p.getByTestId("apple-inbox").waitFor({ state: "detached" });
const merged = (await (await p.request.get(B + `/api/training/sessions/${webId}`)).json()) as { durationSec: number; kcal: number | null; track: { distanceM: number; hrAvg: number; hrMax: number } };
need(merged.track.distanceM === 5000 && merged.track.hrAvg === 148 && merged.track.hrMax === 171 && merged.kcal === 480, `fusión: ${JSON.stringify(merged.track)} kcal ${merged.kcal}`);
log("fusionado: rellena huecos y conserva lo escrito");

// 4) Segundo entreno → «Crear aparte»; tercero → «Descartar»
await send({ type: "Remo", name: "Remo aparte Apple", start: at("17:00"), end: at("17:30"), kcal: 300, hrAvg: 130 }, token);
await send({ type: "Yoga", name: "Yoga descartable", start: at("19:00"), end: at("19:30") }, token);
await p.goto(B + "/training", { waitUntil: "load" });
await p.waitForTimeout(1500);
need((await p.getByTestId("apple-item").count()) === 2, "deben quedar 2 borradores");
await p.getByTestId("apple-item").filter({ hasText: "Remo aparte Apple" }).getByTestId("apple-import").click();
await p.getByTestId("apple-item").filter({ hasText: "Remo aparte Apple" }).waitFor({ state: "detached" });
await p.getByTestId("apple-item").filter({ hasText: "Yoga descartable" }).getByTestId("apple-discard").click();
await p.getByTestId("apple-inbox").waitFor({ state: "detached" });
const mine = (await (await p.request.get(B + "/api/training/sessions")).text());
need(mine.includes("Remo aparte Apple"), "la sesión aparte no aparece para su dueña");
need(!mine.includes("Yoga descartable"), "lo descartado no debe crearse");
await send({ type: "Yoga", name: "Yoga descartable", start: at("19:00"), end: at("19:30") }, token);
need((await (await p.request.get(B + "/api/training/apple-fitness/pending")).json()).items.length === 0, "lo descartado no debe reaparecer al reenviar");
log("aparte y descartado");

// 5) La entrenadora vinculada ve lo completado y NO lo creado aparte
const coachEmail = `apple-coach-${stamp}@e2e.test`;
const cctx = await mkCtx("198.51.100.82");
const coach = await login(cctx, coachEmail, newUser(coachEmail, "Entrenadora", "COACH"));
need((await coach.request.post(B + "/api/coach/links", { data: { athleteEmail } })).ok(), "invitación del coach");
const link = ((await (await p.request.get(B + "/api/coach/links")).json()) as { asAthlete: Array<{ id: string }> }).asAthlete[0];
need((await p.request.patch(B + `/api/coach/links/${link.id}`, { data: { status: "ACTIVE" } })).ok(), "aceptar el vínculo");
const seen = await (await coach.request.get(B + `/api/training/sessions?athleteId=${me}`)).text();
need(seen.includes("Rodaje web"), "la entrenadora debe ver la sesión completada con el reloj");
need(!seen.includes("Remo aparte Apple"), "la entrenadora NO debe ver la sesión aparte de Apple");
need((await coach.request.get(B + "/api/training/apple-fitness/pending")).status() === 200 && (await (await coach.request.get(B + "/api/training/apple-fitness/pending")).json()).items.length === 0, "la bandeja de la entrenadora debe estar vacía");
log("aislamiento con la entrenadora");

// 6) Revocar: el token deja de valer
await p.goto(B + "/settings#apple-fitness", { waitUntil: "load" });
await p.waitForTimeout(1500);
await p.getByTestId("apple-token-revoke").click();
await p.getByRole("alertdialog").getByRole("button", { name: "Revocar", exact: true }).click();
await p.getByTestId("apple-token-create").filter({ hasText: "Generar token" }).waitFor();
need((await send(w1, token)).status() === 401, "el token revocado debe dar 401");
log("token revocado");

await browser.close();
if (errors.length) {
  console.error("✘", errors.join("\n✘ "));
  process.exit(1);
}
console.log("OK apple");
