// E2E de la v1.5 en un móvil de 390 px (app con ALLOW_REGISTRATION=true y LIFEOS_FAKE_AI=1).
//   BASE_URL=http://localhost:3000 npm run e2e:v15
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
const shot = (n: string) => page.screenshot({ path: `${out}/v15-${n}.png`, fullPage: true });
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

// 1. Registro con perfil de mujer
await go(B + "/register");
await page.fill("#name", "Atleta Prueba");
await page.fill("#email", `v15${Date.now()}@test.dev`);
await page.fill("#password", "contraseña-segura-1");
await Promise.all([page.waitForURL(/\/settings\?welcome=1/), page.click("button[type=submit]")]);
await page.selectOption("#p-sex", "FEMALE");
await page.getByRole("button", { name: "Guardar perfil" }).click();
await toast(/Perfil guardado/);
log("registro y perfil");

// 2. Bloque M: salud de la mujer
// Ciclo: regla hace 1 día y se encuentra peor durante la regla; test de RM mañana → sugerencia de moverlo
await api("put", "/api/health/cycle", { avgLength: 28, periodDays: 5, lastStart: plusDays(madrid, -1), hormonal: "no", symptoms: ["dolor"], symptomParts: ["regla"] });
await api("post", "/api/training/sessions", { date: plusDays(madrid, 1), type: "STRENGTH", status: "PLANNED", title: "Fuerza · SERIE DE TEST", strength: { sets: [] } });
await go(B + "/recovery");
await page.getByRole("link", { name: "Salud de la mujer" }).click();
await page.waitForURL(/\/recovery\/women$/);
const health = page.getByLabel("Avisos de salud");
await health.getByText("«Fuerza · SERIE DE TEST» cae en un día con síntomas previstos").waitFor();
await health.getByText("Toca el cribado de RED-S").waitFor();

// Cribado: una respuesta roja → valoración médica
for (const q of await page.getByRole("radiogroup").all()) {
  const name = (await q.getAttribute("aria-label")) ?? "";
  if (!name.startsWith("¿")) continue;
  await q.getByRole("radio", { name: /fractura por estrés/.test(name) ? "Sí" : "No", exact: true }).click();
}
await page.getByRole("button", { name: "Guardar el cribado" }).click();
await toast(/Cribado guardado/);
await health.getByText("Cribado de RED-S: señal de alarma").waitFor();

// Analítica con ferritina baja
await page.getByRole("textbox", { name: "Ferritina", exact: true }).fill("18");
await page.getByRole("button", { name: "Guardar analítica" }).click();
await toast(/Analítica guardada/);
await health.getByText(/Ferritina 18 µg\/L/).waitFor();

// Suelo pélvico
await page.getByRole("group", { name: "Síntomas de suelo pélvico" }).getByRole("checkbox", { name: "Pérdidas de orina al saltar" }).click();
await page.getByRole("button", { name: "Anotar hoy" }).click();
await toast(/Anotado/);
await health.getByText("Síntomas de suelo pélvico esta semana").waitFor();
await shot("01-women");
await noOverflow("salud de la mujer");

// Inicio muestra los avisos fuertes; el calendario, los días previstos
await go(B + "/");
await page.getByLabel("Avisos de salud").getByText(/Ferritina 18/).waitFor();
await go(`${B}/planning?month=${madrid.slice(0, 7)}`);
if (!(await page.getByTitle(/Regla prevista|Síntomas previstos/).count())) errors.push("calendario: no marca los días previstos del ciclo");

// Modo posparto: fases y bloqueo de la IA
await go(B + "/recovery/women");
await radio("Modo", "Posparto").click();
await page.fill("#pp-date", plusDays(madrid, -50));
await page.getByRole("button", { name: "Guardar ajustes" }).click();
await toast(/Ajustes guardados/);
await page.getByText(/Vuelta posparto · semana 7/).waitFor();
await page.getByLabel("Criterios para pasar de fase").getByText(/Tengo el alta/).click();
await toast(/Guardado/);
await page.getByLabel("Fases posparto").getByText("▶ 6–12 semanas: fuerza de base sin impacto").waitFor();
await shot("02-postpartum");
await go(B + "/study/plan");
await page.getByText(/Tienes activo el modo posparto/).waitFor();
log("salud de la mujer: cribado, ferritina, suelo pélvico, ciclo en el plan y posparto");

// El informe compartido y el .ics no llevan nada de esto
await go(B + "/settings#informe");
await page.getByRole("button", { name: "Crear enlace del informe" }).click();
const reportUrl = (await page.getByRole("textbox", { name: "Enlace del informe" }).inputValue()).replace(/^https?:\/\/[^/]+/, B);
const report = await (await page.request.get(reportUrl)).text();
if (/ferritina|suelo pélvico|posparto|RED-S|regla/i.test(report)) errors.push("informe: contiene datos de salud de la mujer");
log("el informe compartido no lleva datos de salud de la mujer");

// 3. Bloques G y H: consistencia, calentamiento, carga y bienestar, CSV de VFC, vuelta por fases y agua
const tech = (await api("post", "/api/training/sessions", {
  date: madrid,
  type: "TECHNICAL",
  discipline: "THROWS",
  status: "COMPLETED",
  durationSec: 3600,
  sessionRpe: 7,
  technical: { event: "JAVELIN", implementWeightG: 600, isCompetition: false, attempts: [40, 42, null, 41].map((m) => ({ markM: m, isFoul: m == null, isMeasured: m != null })) },
})) as { id: string };
await go(`${B}/training/${tech.id}`);
await page.getByLabel("Consistencia").getByText("25 %").waitFor(); // 1 nulo de 4
await go(B + "/training/performance");
await page.getByRole("figure", { name: /Intentos: Jabalina · 600 g/ }).count(); // con un solo día no hay gráfica: basta con que no falle

const ev = (await api("post", "/api/planning/events", { type: "COMPETITION", title: "Control de prueba", startAt: madrid })) as { id: string };
await go(`${B}/planning/competition/${ev.id}`);
const inAnHour = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(Date.now() + 3 * 3600e3));
await page.fill("#ev-time", inAnHour);
await page.getByRole("timer").getByText(/Empieza a calentar a las/).waitFor();
log("consistencia técnica y calentamiento cronometrado");

await go(B + "/recovery");
await page.getByLabel("Carga y bienestar").waitFor();
await page.getByLabel("CSV de VFC y sueño").setInputFiles({ name: "hrv.csv", mimeType: "text/csv", buffer: Buffer.from(`date,rmssd,sleep\n${plusDays(madrid, -2)},85,7.5\n${plusDays(madrid, -1)},88,8\n`) });
await page.getByRole("button", { name: "Vista previa" }).click();
await page.getByRole("button", { name: "Importar 2 días" }).click();
await toast(/2 días importados/);
log("carga y bienestar, e importar VFC desde CSV");

await api("post", "/api/recovery/injuries", { area: "ELBOW", pain: 2, startedOn: madrid, limitsTraining: true });
await go(B + "/recovery");
await page.getByRole("button", { name: "Vuelta por fases" }).click();
await toast(/Vuelta por fases creada/);
const proto = page.getByLabel("Vuelta por fases");
await proto.getByText(/Fase 1\/5: 1 · Calmar/).waitFor();
for (const label of ["Sin dolor en reposo ni en el día a día", "Movilidad completa sin dolor"]) {
  await proto.getByLabel(label).click();
  await toast(/Guardado/);
}
await proto.getByText(/Fase 2\/5/).waitFor();
await shot("03-recovery");
await noOverflow("recuperación");
log("vuelta tras lesión por fases");

await go(B + "/nutrition");
await page.getByRole("button", { name: "+250 ml" }).click();
await page.getByLabel("Agua").getByText(/0,25 \//).waitFor();
log("agua del día");

// 4. Bloque I: tests físicos, plan propio (crear, editar, duplicar, activar), imprimir y mover
await go(B + "/training/tests");
for (const v of ["4,2", "4,0"]) {
  await page.selectOption("#t-test", "sprint30");
  await page.fill("#t-value", v);
  await page.getByRole("button", { name: "Guardar resultado" }).click();
  await toast(/Resultado guardado/);
}
await page.getByLabel("Resultados por test").getByText("▲ 4,8 %").waitFor();
log("tests físicos con mejora");

await go(B + "/planning/plan/new");
await page.fill("#mp-name", "Pretemporada propia");
await page.fill("#mp-start", plusDays(madrid, 7));
await radio("Semanas", "2").click();
await page.getByRole("button", { name: "Crear plan" }).click();
await page.waitForURL(/\/planning\/meso\/P\d+$/);
const mesoUrl = page.url();
await page.getByRole("link", { name: /entreno/ }).first().click();
await page.getByRole("link", { name: "Editar este día" }).click();
await page.waitForURL(/\/edit$/);
await page.fill("#md-title", "Fuerza A");
await page.getByRole("button", { name: "+ Ejercicio" }).click();
await page.getByLabel("Ejercicio 1", { exact: true }).fill("Sentadilla trasera");
await page.getByLabel("Series 1", { exact: true }).fill("3 × 5");
await page.getByLabel("Carga 1", { exact: true }).fill("80 kg");
await page.getByRole("button", { name: "Guardar día" }).click();
await toast(/Día guardado/);
await page.waitForURL(mesoUrl);
page.once("dialog", (d) => d.accept());
await page.getByRole("button", { name: "Duplicar semana" }).click();
await toast(/días copiados/);
await page.getByRole("button", { name: "Activar en mis entrenamientos" }).click();
await toast(/Plan activado: \d+ sesiones/);
await shot("04-manual-plan");
log("plan propio: crear, editar, duplicar semana y activar");

const day = page.getByRole("link", { name: /Fuerza A/ }).first();
await day.click();
await page.waitForURL(/\/planning\/plan\/[^/]+$/);
const dayId = page.url().split("/").pop()!;
await go(`${B}/print/plan/${dayId}`);
await page.getByRole("button", { name: "Imprimir o guardar en PDF" }).waitFor();
await page.getByText("Sentadilla trasera").waitFor();
log("plan del día imprimible");

await go(`${B}/planning/plan/${dayId}`);
await page.getByRole("link", { name: "Ver sesión" }).click();
await page.waitForURL(/\/training\/c/);
await page.getByText("Mover o duplicar").click();
await page.getByLabel("Nuevo día").fill(plusDays(madrid, 30));
await page.getByRole("button", { name: "Mover", exact: true }).click();
await toast(/Sesión movida/);
log("mover una sesión planificada");

// 5. Bloque J: pregunta a tus datos y dictar la sesión (IA simulada en la CI)
await go(B + "/study/ask");
await page.getByLabel("Preguntas sugeridas").getByRole("button").first().click();
await page.getByLabel("Respuesta").getByText(/sesiones/).waitFor();
log("pregunta a tus datos");

await go(B + "/training/new");
await page.getByText("🎙 Dictar la sesión de fuerza").click();
await page.getByLabel("Texto dictado").fill("Sentadilla trasera 3 por 5 a 90 kilos RIR 2, 50 minutos, RPE 7");
await page.getByRole("button", { name: "Convertir en sesión" }).click();
await toast(/Borrador listo/);
if ((await page.getByRole("textbox", { name: "Peso serie 1", exact: true }).inputValue()) !== "90") errors.push("voz: el peso no llegó al formulario");
await Promise.all([page.waitForURL(/\/training\/c[^/]*$/), page.getByRole("button", { name: /^Guardar sesión$/ }).click()]);
await page.getByText("Sentadilla trasera").first().waitFor();
log("dictar la sesión → formulario → guardada");

// 6. Bloque K: horario y exámenes, pomodoro y hábitos
await api("post", "/api/training/sessions", { date: plusDays(madrid, 3), type: "STRENGTH", status: "PLANNED", title: "Lanzamientos largos", strength: { sets: [] } });
await go(B + "/study/schedule");
await page.getByRole("radio", { name: "Examen" }).click();
await page.getByLabel("Asignatura").fill("Cálculo");
await page.getByLabel("Fecha del examen").fill(plusDays(madrid, 3));
await page.getByRole("button", { name: "Añadir examen" }).click();
await toast(/Examen añadido/);
await page.getByRole("radio", { name: "Clase semanal" }).click();
await page.getByLabel("Asignatura").fill("Física");
await page.getByRole("button", { name: "Añadir clase" }).click();
await toast(/Clase añadida/);
await page.getByLabel("Choques con exámenes").getByText(/Lanzamientos largos.*mismo día.*Cálculo/).waitFor();
await noOverflow("/study/schedule");
await shot("05-schedule");
log("horario: examen y clase; aviso de entreno el día del examen");

await go(B + "/study/focus");
await page.getByLabel("Asignatura").fill("Cálculo");
await page.getByRole("button", { name: "Empezar pomodoro" }).click();
await page.getByRole("timer").getByText(/Concentración · Cálculo/).waitFor();
await page.getByRole("button", { name: /Terminar ahora/ }).click();
await page.getByLabel("¿Estudiaste sin temporizador? Minutos").fill("45");
await page.getByRole("button", { name: "Anotar", exact: true }).click();
await toast(/Estudio anotado/);
await page.getByLabel("Horas por asignatura").getByText("45 min").waitFor();
await noOverflow("/study/focus");
log("pomodoro y horas de estudio por asignatura");

await go(B + "/");
await page.getByLabel("Nuevo hábito").fill("Estiramientos");
await page.getByRole("button", { name: "Añadir", exact: true }).click();
const habit = page.getByRole("checkbox", { name: "Estiramientos" });
await habit.click();
await page.waitForTimeout(500);
await go(B + "/");
if ((await habit.getAttribute("aria-checked")) !== "true") errors.push("hábito: el toque no se guardó");
await page.getByLabel("Hábitos de hoy").getByText("1", { exact: true }).waitFor();
await noOverflow("/ (hábitos)");
await shot("06-habits");
log("hábito marcado de un toque, con racha");

// 7. Bloque L: becas, material, comentarios de la entrenadora y estado del servidor
const acc = (await api("post", "/api/finance/accounts", { name: "Banco", type: "ASSET" })) as { id?: string };
await api("post", "/api/finance/transactions", { mode: "simple", kind: "INCOME", date: madrid, description: "Beca federación", amountCents: 120000, moneyAccountId: acc.id, sport: true });
await go(B + "/finance");
await page.getByLabel("Saldo deportivo por temporada").getByText(/Becas, premios y patrocinios 1200,00/).waitFor();
log("beca deportiva en el saldo de la temporada");

await go(B + "/training/equipment");
await page.getByLabel("Nombre").fill("Jabalina 600");
await page.getByLabel("Peso (g)").fill("600");
await page.getByLabel(/Vida útil/).fill("10");
await page.getByRole("button", { name: "Añadir material" }).click();
await toast(/Material añadido/);
await page.getByLabel("Usos extra de Jabalina 600").fill("12");
await page.getByRole("button", { name: "Anotar" }).click();
await page.getByLabel("Avisos de material").getByText("Toca reponer: Jabalina 600").waitFor();
await noOverflow("/training/equipment");
await shot("07-equipment");
log("material con aviso de reposición");

const athleteEmail = ((await (await page.request.get(B + "/api/profile")).json()) as { email: string }).email;
const user = (...a: string[]) => execFileSync("npm", ["run", "-s", "user", "--", ...a], { encoding: "utf8" });
const newUser = (email: string, role: string) => {
  const pw = user("create", email, "--name", "Entrenadora", "--role", role).match(/Contraseña: (\S+)/)?.[1];
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
const coachEmail = `coach-v15-${Date.now()}@test.dev`;
const coach = await login(coachEmail, newUser(coachEmail, "COACH"));
const inv = await coach.request.post(B + "/api/coach/links", { data: { athleteEmail } });
if (!inv.ok()) errors.push(`invitación del coach: ${inv.status()}`);
const link = ((await (await page.request.get(B + "/api/coach/links")).json()) as { asAthlete: Array<{ id: string }> }).asAthlete[0];
await api("patch", `/api/coach/links/${link.id}`, { status: "ACTIVE" });
await coach.goto(B + "/coach");
await coach.getByRole("link", { name: /Sentadilla trasera|Fuerza|Lanzamientos/ }).first().click();
await coach.waitForURL(/\/coach\/session\//);
const sessionId = new URL(coach.url()).pathname.split("/").pop()!;
await coach.getByLabel("Escribe un comentario").fill("Buen trabajo, baja 2,5 kg la próxima");
await coach.getByRole("button", { name: "Enviar" }).click();
await coach.getByLabel("Comentarios").getByText(/Buen trabajo/).waitFor();
await go(`${B}/training/${sessionId}`);
await page.getByLabel("Comentarios").getByText(/Buen trabajo/).waitFor();
await page.getByLabel("Escribe un comentario").fill("Hecho, gracias");
await page.getByRole("button", { name: "Enviar" }).click();
await page.getByLabel("Comentarios").getByText("Hecho, gracias").waitFor();
await noOverflow("/training/[id] (comentarios)");
await shot("08-comments");
await coach.context().close();
log("comentario de la entrenadora y respuesta del atleta");

if ((await page.request.get(B + "/api/admin/status")).status() !== 403) errors.push("estado del servidor: un atleta no debe verlo");
const adminEmail = `admin-v15-${Date.now()}@test.dev`;
const admin = await login(adminEmail, newUser(adminEmail, "ADMIN"));
await admin.goto(B + "/settings#servidor");
const status = admin.getByLabel("Estado del servidor");
await status.getByText(/Base de datos/).waitFor();
await status.getByText(/OK \(\d+ ms/).waitFor();
await status.getByText(/_v1_\d+_/).waitFor();
await admin.screenshot({ path: `${out}/v15-09-status.png`, fullPage: true });
await admin.context().close();
log("estado del servidor solo para admin");

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v15");
