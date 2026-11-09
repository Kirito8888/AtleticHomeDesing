// E2E del «Paquete de estudio» (v2.6) en un móvil de 390 px: formato de examen, generación en segundo plano (IA simulada),
// resumen por prioridad, juego con desarrollo/práctica/apelación, progreso en servidor y examen final cronometrado.
// Necesita build de producción, DATABASE_URL y LIFEOS_FAKE_AI=1:   BASE_URL=http://localhost:3100 npm run e2e:v26pack
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import { chromium } from "playwright-core";

const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];
const out = process.env.SHOTS_DIR ?? "/tmp/e2e-out";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.226" } });
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
  const n = await loc.count();
  if (!n) return void errors.push(`${what}: no existe`);
  for (let i = 0; i < n; i++) {
    const h = (await loc.nth(i).boundingBox())?.height ?? 0;
    if (h < 43.5) errors.push(`${what} #${i} mide ${h}px (< 44)`);
  }
};

const email = `pack${Date.now()}@test.dev`;
const created = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", "Atleta", "--role", "ATHLETE", "--accept-terms"], { encoding: "utf8" });
const pw = created.match(/Contraseña: (\S+)/)?.[1];
if (!pw) throw new Error("no se pudo crear la cuenta");
await page.goto(B + "/login");
await page.fill("#email", email);
await page.fill("#password", pw);
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);

const dbUrl = (process.env.DATABASE_URL ?? "").replace(/\?.*/, "");
const psql = (sql: string) => execFileSync("psql", [dbUrl, "-Atqc", sql], { encoding: "utf8" }).trim();
const uid = psql(`select id from "User" where email='${email}'`);
const stamp = Date.now();
const mid = `mod${stamp}`;
const tid = `top${stamp}`;
const did = `doc${stamp}`;
const SOURCE = [
  "El comando useradd crea usuarios nuevos en el sistema operativo.",
  "El fichero /etc/passwd guarda la lista de cuentas de usuario.",
  "El comando passwd cambia la contraseña de una cuenta existente.",
  "Los grupos secundarios se gestionan con el comando usermod desde la consola.",
  "El comando userdel elimina una cuenta de usuario del sistema.",
  "$ useradd -m ana",
  "$ passwd ana",
  "$ userdel -r ana",
].join("\n");
psql(`insert into "StudyModule"(id,"userId",name,"updatedAt") values ('${mid}','${uid}','Administración',now())`);
psql(`insert into "StudyDocument"(id,"userId","moduleId",title,"mimeType","storagePath","sizeBytes",status,"embedModel","updatedAt") values ('${did}','${uid}','${mid}','Tema 3 · usuarios','text/markdown','',100,'EMBEDDED','texto',now())`);
psql(`insert into "DocumentChunk"(id,"documentId","userId","chunkIndex",content) values ('ch${stamp}','${did}','${uid}',0,'${SOURCE.replace(/'/g, "''")}')`);
psql(`insert into "StudyTopic"(id,"userId","moduleId",name,tag,"documentId") values ('${tid}','${uid}','${mid}','Usuarios y grupos','red','${did}')`);

// 1 · sin formato de examen, «Generar paquete» pregunta antes cómo es el examen
await page.goto(`${B}/study/modules/${mid}`);
await page.getByTestId("pack-section").waitFor();
await noOverflow("asignatura");
const gen = page.getByTestId("pack-generate");
await minH(gen, "«Generar paquete»");
await gen.click();
await page.getByTestId("exam-format").waitFor();
log("antes de generar pregunta «¿Cómo es tu examen?»");
await minH(page.getByRole("checkbox", { name: /Desarrollo/ }), "casillas del formato");
await noOverflow("formato de examen");

// 2 · combinación inválida: sin teórico ni práctico no se puede guardar
await page.getByRole("checkbox", { name: /Teórico/ }).click();
await page.getByRole("checkbox", { name: /Práctico/ }).click();
if (!(await page.getByRole("button", { name: "Guardar formato" }).isDisabled())) errors.push("sin teórico ni práctico no debe poder guardarse");
await page.getByRole("checkbox", { name: /Teórico/ }).click();
await page.getByRole("checkbox", { name: /Práctico/ }).click();
// desarrollo + test teórico + terminal; pesos a mano que no suman 100 → error; luego válidos
await page.getByRole("checkbox", { name: /Desarrollo/ }).click();
await page.getByText("Repartir a mano").click();
await page.locator("#w-theoryTest").fill("50");
await page.locator("#w-theoryEssay").fill("20");
await page.locator("#w-practiceCmd").fill("20");
if (!(await page.getByRole("button", { name: "Guardar formato" }).isDisabled())) errors.push("pesos que suman 90 no deben guardarse");
await page.locator("#w-practiceCmd").fill("30");
await page.locator("#ef-q").fill("12");
await page.locator("#ef-min").fill("30");
await page.getByRole("button", { name: "Guardar formato" }).click();
log("formato guardado (test + desarrollo + terminal, pesos 50/20/30)");

// 3 · la generación arranca sola y avanza en segundo plano (sin router.refresh)
await page.getByTestId("pack-ready").waitFor({ timeout: 60_000 });
log("paquete generado en segundo plano");
await minH(page.getByTestId("pack-play"), "«Web de estudio del tema»");
await minH(page.getByTestId("pack-open-game"), "«Abrir la web de estudio»");
if (!(await page.getByTestId("pack-play").getAttribute("href"))?.includes(`level=${tid}`)) errors.push("«Web de estudio del tema» no abre el nivel del tema");
const row = psql(`select status||'|'||coalesce(model,'') from "StudyTopicPack" where "topicId"='${tid}'`);
if (row !== "READY|simulado") errors.push(`paquete en BD: ${row}`);
const fmt = psql(`select "examFormat"::text from "StudyModule" where id='${mid}'`);
if (!fmt.includes('"questions": 12') && !fmt.includes('"questions":12')) errors.push(`examFormat en BD: ${fmt}`);
await page.screenshot({ path: `${out}/pack-390.png`, fullPage: true });

// 3b · N2: crear flashcards desde el paquete (mazo de la asignatura, confirmación con cifras, sin duplicar)
const cardsIn = (deck: string) => Number(psql(`select count(*) from "Flashcard" f join "FlashcardDeck" d on d.id=f."deckId" where d."userId"='${uid}' and d.name='${deck}'`));
const toast = (re: RegExp) => page.locator("[data-sonner-toast]", { hasText: re }).first().waitFor({ timeout: 8000 });
await minH(page.getByTestId("pack-cards"), "«Crear flashcards» del tema");
await page.getByTestId("pack-cards").click();
await page.getByTestId("cards-form").waitFor();
if (!(await page.getByLabel("Mazo de destino").innerText()).includes("Administración")) errors.push("N2: el mazo vinculado a la asignatura no aparece");
await noOverflow("flashcards del paquete");
await minH(page.getByTestId("cards-review"), "«Revisar»");
await page.getByTestId("cards-review").click();
const dlg = page.getByRole("alertdialog");
await dlg.waitFor();
const txt = (await dlg.textContent()) ?? "";
const nNew = Number(/Crear (\d+)/.exec(txt)?.[1] ?? 0);
if (!nNew || !/0 se descartan/.test(txt)) errors.push(`N2: diálogo sin cifras: ${txt}`);
if (cardsIn("Administración") !== 0) errors.push("N2: se escribió antes de confirmar");
await dlg.getByRole("button", { name: "Cancelar" }).click();
if (cardsIn("Administración") !== 0) errors.push("N2: cancelar creó tarjetas");
await page.getByTestId("cards-review").click();
await page.getByRole("alertdialog").getByRole("button", { name: "Crear" }).click();
await toast(/flashcards? creadas?/);
if (cardsIn("Administración") !== nNew) errors.push(`N2: se esperaban ${nNew} tarjetas y hay ${cardsIn("Administración")}`);
await page.getByTestId("pack-cards").click();
await page.getByTestId("cards-review").click();
await toast(/ya están/);
if (cardsIn("Administración") !== nNew) errors.push("N2: la segunda vez duplicó tarjetas");
const foreign = await page.request.post(`${B}/api/study/cards/import`, { data: { deck: "X", dryRun: true, source: { kind: "pack", topicId: "no-es-mia" } } });
if (foreign.status() !== 404) errors.push(`N2: tema ajeno debe dar 404 (${foreign.status()})`);
log(`N2: ${nNew} flashcards del paquete en «Administración»; repetir no duplica; tema ajeno 404`);

// 4 · resumen por prioridad
await page.getByTestId("pack-summary-link").click();
await page.getByTestId("summary").waitFor();
const sum = await page.getByTestId("summary").innerText();
for (const h of ["Si solo tengo 10 minutos", "Cae seguro", "Probable", "Si sobra tiempo", "Autoevaluación"]) if (!sum.includes(h)) errors.push(`resumen sin «${h}»`);
if ((await page.getByTestId("summary-block").count()) < 2) errors.push("el resumen debe tener bloques");
if (await page.getByTestId("summary-solutions").evaluate((e) => (e as HTMLDetailsElement).open)) errors.push("las soluciones deben ir plegadas");
await noOverflow("resumen");
await page.screenshot({ path: `${out}/pack-summary-390.png`, fullPage: true });
log("resumen: 10 minutos, tres niveles de prioridad, soluciones aparte");

// 5 · mapa: tutorial la primera vez, y luego queda visto
await page.goto(`${B}/study/modules/${mid}/quest`);
await page.getByTestId("quest").waitFor();
await page.getByTestId("quest-how").waitFor();
await minH(page.getByTestId("quest-how-ok"), "«Entendido»");
await page.getByTestId("quest-how-ok").click();
if (await page.getByTestId("quest-how").count()) errors.push("el tutorial debe ocultarse");
log("tutorial «Cómo se juega»");

// Respuestas correctas del paquete (para jugar sin perder todas las vidas al azar)
type Batch = { theoryTest: { question: string; options: string[]; correct: number }[]; practiceCmd: { prompt: string; solution: string }[] };
const game = JSON.parse(psql(`select game::text from "StudyTopicPack" where "topicId"='${tid}'`)) as { levels: Record<string, Batch> };
const batches = Object.values(game.levels);
const rightOpt = new Map(batches.flatMap((b) => b.theoryTest.map((q) => [q.question, q.options[q.correct]] as const)));
const rightCmd = new Map(batches.flatMap((b) => b.practiceCmd.map((q) => [q.prompt, q.solution] as const)));
const theoryClick = async () => {
  const q = (await page.locator("[data-testid=quest-card] p").first().innerText()).trim();
  const want = rightOpt.get(q);
  if (want) await page.locator("[data-opt]", { hasText: want }).first().click();
  else await page.locator("[data-opt]").first().click();
};

// 6 · partida: preguntas del paquete (sin llamar a la IA), desarrollo con rúbrica y apelación
let aiGenerated = 0;
page.on("request", (r) => {
  if (r.url().includes("/api/ai/study/quest") && r.method() === "POST") aiGenerated++;
});
await page.locator("[data-node]").first().click();
await page.getByTestId("quest-start").waitFor();
await page.waitForTimeout(600);
if (!(await page.locator("text=Preguntas de tu paquete de estudio").count())) errors.push("debe indicar que las preguntas salen del paquete");
await page.getByTestId("quest-start").click();
let sawEssay = false;
let sawAppeal = false;
for (let k = 0; k < 40; k++) {
  if (await page.getByTestId("quest-result").count()) break;
  await page.getByTestId("quest-card").waitFor();
  await page.waitForTimeout(450);
  if (await page.getByTestId("essay-reveal").count()) {
    sawEssay = true;
    await minH(page.getByTestId("essay-reveal"), "«Ver la rúbrica»");
    await page.locator("textarea").fill("Mi respuesta con mis palabras");
    await page.getByTestId("essay-reveal").click();
    await page.getByTestId("essay-rubric").waitFor();
    const boxes = page.getByTestId("essay-rubric").getByRole("checkbox");
    for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).check();
    await minH(page.getByTestId("essay-confirm"), "«Confirmar»");
    await page.getByTestId("essay-confirm").click();
  } else if (await page.locator("input[name=cmd]").count()) {
    const prompt = (await page.locator("[data-testid=quest-card] p").first().innerText()).trim();
    if (sawAppeal) {
      await page.locator("input[name=cmd]").fill(rightCmd.get(prompt) ?? "zzz");
      await page.locator("input[name=cmd]").press("Enter");
      await page.getByTestId("quest-feedback").waitFor();
    } else {
      await page.locator("input[name=cmd]").fill("zzz comando propio");
      await page.locator("input[name=cmd]").press("Enter");
      await page.getByTestId("quest-feedback").waitFor();
      sawAppeal = true;
      await minH(page.getByTestId("quest-appeal"), "«Mi comando también vale»");
      await page.getByTestId("quest-appeal").click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Sí, apelar" }).click();
      await page.getByText("Aceptado por apelación").waitFor();
    }
  } else {
    await theoryClick();
  }
  const next = page.getByTestId("quest-next");
  await next.waitFor();
  await next.click();
}
await page.getByTestId("quest-result").waitFor();
if (!sawEssay) errors.push("no salió ninguna pregunta de desarrollo");
if (!sawAppeal) errors.push("no salió ninguna práctica para apelar");
if (aiGenerated !== 1) errors.push(`la partida debe pedir las preguntas una vez (${aiGenerated})`);
await noOverflow("resultado");
log("partida con teoría, desarrollo por rúbrica, práctica y apelación");

// 7 · progreso en servidor: sobrevive a borrar el almacenamiento local
await page.goto(`${B}/study/modules/${mid}/quest`);
await page.getByTestId("quest").waitFor();
await page.waitForTimeout(2000); // el envío va con un pequeño retardo
const stored = psql(`select state->>'xp' from "QuestProgress" where "userId"='${uid}' and "moduleId"='${mid}'`);
if (!stored || Number(stored) <= 0) errors.push(`progreso no guardado en el servidor (xp=${stored})`);
const xpBefore = (await page.getByTestId("quest-xp").innerText()).trim();
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.getByTestId("quest").waitFor();
await page.waitForFunction((x) => document.querySelector("[data-testid=quest-xp]")?.textContent?.trim() === x, xpBefore, { timeout: 10_000 }).catch(() => errors.push("tras borrar el almacenamiento local, el XP no se recuperó del servidor"));
if (await page.getByTestId("quest-how").count()) errors.push("el tutorial visto debe recuperarse del servidor");
if (await page.getByTestId("quest-appeals").isDisabled()) errors.push("las apelaciones deben recuperarse del servidor");
log("progreso recuperado del servidor tras borrar el almacenamiento local");

// 8 · apelaciones
await page.getByTestId("quest-appeals").click();
await page.getByTestId("quest-appeals-view").waitFor();
if (!(await page.getByTestId("quest-appeals-view").innerText()).includes("zzz comando propio")) errors.push("la apelación no aparece en la lista");
await minH(page.getByRole("button", { name: /Comprobado/ }), "«Comprobado, funciona»");
await page.getByRole("button", { name: /Comprobado/ }).first().click();
log("pantalla de apelaciones");

// 9 · examen final: bloqueado hasta ★★ en el Jefe; el modo libre lo abre
await page.waitForTimeout(500);
if (!(await page.locator("[data-final]").isDisabled())) errors.push("el examen final debe estar bloqueado sin ★★ en el Jefe");
await page.getByRole("button", { name: /Modo libre/ }).click();
await page.locator("[data-final]").click();
await page.waitForURL(/level=final/);
await page.getByTestId("quest-start").waitFor();
await page.waitForTimeout(600);
await page.getByTestId("quest-start").click();
await page.getByTestId("quest-timer").waitFor();
const t0 = await page.getByTestId("quest-timer").innerText();
if (!/30:00|29:5\d/.test(t0)) errors.push(`cronómetro inicial: ${t0}`);
await noOverflow("examen");
if (await page.getByRole("button", { name: /Pista/ }).count()) errors.push("el examen no tiene pistas");
// responde todo sin feedback intermedio
let n = 0;
for (let k = 0; k < 40; k++) {
  if (await page.getByTestId("quest-exam-result").count()) break;
  await page.getByTestId("quest-card").waitFor();
  await page.waitForTimeout(450);
  if (await page.getByTestId("essay-reveal").count()) {
    await page.getByTestId("essay-reveal").click();
    await page.getByTestId("essay-confirm").click(); // 0 puntos clave marcados
  } else if (await page.locator("input[name=cmd]").count()) {
    await page.locator("input[name=cmd]").fill("ls -la /no/vale");
    await page.locator("input[name=cmd]").press("Enter");
  } else await page.locator("[data-opt]").first().click();
  n++;
  if (await page.getByTestId("quest-feedback").count()) errors.push("el examen no corrige pregunta a pregunta");
}
await page.getByTestId("quest-exam-result").waitFor();
const nota = (await page.getByTestId("quest-nota").innerText()).replace(/\s+/g, "");
if (!/^\d+,\d\/10$/.test(nota)) errors.push(`nota con formato raro: ${nota}`);
if (n > 12) errors.push(`el examen tiene ${n} preguntas (> 12)`);
log(`examen final: ${n} preguntas, nota ${nota}`);
const before = Number(nota.split("/")[0].replace(",", "."));
// apelar una práctica desde los resultados sube la nota
const ap = page.getByTestId("quest-appeal");
if (await ap.count()) {
  await ap.first().click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Sí, apelar" }).click();
  await page.waitForFunction((b) => Number((document.querySelector("[data-testid=quest-nota]")?.textContent ?? "0").replace(/\s+/g, "").split("/")[0].replace(",", ".")) > b, before, { timeout: 5000 }).catch(() => errors.push("apelar en los resultados no subió la nota"));
} else errors.push("en los resultados debe poderse apelar una práctica");
await page.screenshot({ path: `${out}/pack-exam-390.png`, fullPage: true });
await page.goto(`${B}/study/modules/${mid}/quest`);
await page.getByTestId("quest-exams").waitFor();
if (!(await page.getByTestId("quest-final-best").innerText()).includes("mejor nota")) errors.push("falta la mejor nota del examen final");
log("historial y mejor nota del examen final");

// 10 · cronómetro: al agotarse el tiempo, todo lo que falta cuenta como fallo
const cl = await ctx.newPage();
await cl.clock.install();
await cl.goto(`${B}/study/modules/${mid}/quest/play?level=final`);
await cl.getByTestId("quest-start").waitFor();
await cl.getByTestId("quest-start").click();
await cl.getByTestId("quest-timer").waitFor();
await cl.clock.fastForward("31:00");
await cl.getByTestId("quest-exam-result").waitFor({ timeout: 10_000 });
const nota0 = (await cl.getByTestId("quest-nota").innerText()).replace(/\s+/g, "");
if (nota0 !== "0,0/10") errors.push(`sin tiempo la nota debe ser 0,0/10 (${nota0})`);
if (!(await cl.getByTestId("quest-review").innerText()).includes("(sin tiempo)") && !(await cl.getByTestId("quest-review").count())) errors.push("sin revisión tras agotar el tiempo");
log("el tiempo se agota y lo pendiente cuenta como fallo");

// 11 · reiniciar partida (confirmación) y aislamiento de otra cuenta
await page.goto(`${B}/study/modules/${mid}/quest`);
await page.getByTestId("quest-reset").click();
await page.getByRole("alertdialog").getByRole("button", { name: "Reiniciar" }).click();
await page.waitForFunction(() => document.querySelector("[data-testid=quest-xp]")?.textContent?.trim() === "0");
log("reiniciar partida");
const other = execFileSync("npm", ["run", "-s", "user", "--", "create", `pack2${Date.now()}@test.dev`, "--name", "Otra", "--role", "ATHLETE", "--accept-terms"], { encoding: "utf8" });
void other;
const r1 = await page.request.get(`${B}/api/study/quest-progress/${mid}`);
if (r1.status() !== 200) errors.push(`propio GET ${r1.status()}`);
const r2 = await page.request.get(`${B}/api/ai/study/pack/no-existe`);
if (r2.status() !== 404) errors.push(`pack ajeno/inexistente debe dar 404 (${r2.status})`);

await browser.close();
if (errors.length) {
  console.error("\n✘ Fallos:\n - " + errors.join("\n - "));
  process.exit(1);
}
console.log("\nOK v26pack");
