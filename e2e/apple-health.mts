// Apple Salud (v3.1 B) a 390 px: token en Ajustes (plantilla), envío diario con Bearer, vacío/igual se guardan solos,
// un valor distinto abre aviso en /recovery y se elige con cuál quedarse. Datos sintéticos.
//   BASE_URL=http://localhost:3000 npm run e2e:health
import { execFileSync } from "node:child_process";

import { chromium, type BrowserContext, type Page } from "playwright-core";

const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];
const need = (ok: boolean, msg: string) => { if (!ok) errors.push(msg); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx: BrowserContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.91" } });
const email = `health-${Date.now()}@e2e.test`;
const o = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", "Atleta Salud", "--role", "ATHLETE", "--accept-terms"], { encoding: "utf8" });
const pw = o.match(/Contraseña: (\S+)/)?.[1];
if (!pw) throw new Error("no se pudo crear el usuario");
const p: Page = await ctx.newPage();
p.on("pageerror", (e) => errors.push(`pageerror ${p.url()}: ${e.message}`));
await p.goto(B + "/login", { waitUntil: "load" });
await p.waitForTimeout(4000);
await p.fill("#email", email);
await p.fill("#password", pw);
await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login")), p.click("button[type=submit]")]);
const noHScroll = async (tag: string) => need(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), `scroll horizontal (${tag})`);

const todayMadrid = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());

// 1) Ajustes: token + sección de Apple Salud con plantilla
await p.goto(B + "/settings#apple-fitness", { waitUntil: "load" });
await p.waitForTimeout(1500);
await p.getByTestId("apple-token-create").click();
await p.getByTestId("apple-token-fresh").waitFor();
const token = (await p.getByTestId("apple-token-value").innerText()).trim();
await p.getByTestId("health-settings").locator("summary").click();
need(await p.getByTestId("health-settings").getByText("Plantilla JSON diaria").isVisible(), "falta la plantilla de Apple Salud");
need((await p.getByTestId("health-settings").innerText()).includes("/api/recovery/apple-health"), "falta la URL de Apple Salud");
await noHScroll("ajustes");
log("token y plantilla visibles");

// 2) Anotar a mano el peso de hoy
const manual = await p.request.post(B + "/api/recovery", { data: { date: todayMadrid, bodyWeightKg: 61 } });
need(manual.ok(), `anotar peso: ${manual.status()}`);

// 3) Envío: 401 sin token; con token: vacíos se guardan, peso distinto → conflicto
const send = (body: unknown, tok?: string) => ctx.request.post(B + "/api/recovery/apple-health", { data: body, headers: tok ? { authorization: `Bearer ${tok}` } : {} });
const day = { date: todayMadrid, sleepHours: 7.4, hrvSdnnMs: 48, restingHr: 52, weightKg: 63 };
need((await send(day)).status() === 401, "sin token debe dar 401");
need((await send({ ...day, restingHr: 999 }, token)).status() === 400, "FC absurda debe dar 400");
const r = await send(day, token);
const rj = (await r.json()) as { saved: number; conflicts: number };
need(r.status() === 200 && rj.saved === 3 && rj.conflicts === 1, `envío: ${r.status()} ${JSON.stringify(rj)}`);
const again = (await (await send(day, token)).json()) as { saved: number; conflicts: number; unchanged: number };
need(again.saved === 0 && again.unchanged === 3, `idempotencia: ${JSON.stringify(again)}`);
log("endpoint: 401/400/200 e idempotencia");

// 4) /recovery: aviso, valores guardados y readiness
await p.goto(B + "/recovery", { waitUntil: "load" });
await p.waitForTimeout(1500);
await p.getByTestId("health-conflicts").waitFor();
need((await p.getByTestId("health-conflict").count()) === 1, "debe haber 1 aviso");
const txt = await p.getByTestId("health-conflict").innerText();
need(/Peso/.test(txt) && /61/.test(txt) && /63/.test(txt), `texto del aviso: ${txt}`);
for (const id of ["health-keep-current", "health-take-incoming"]) {
  const bb = await p.getByTestId(id).boundingBox();
  need(!!bb && bb.height >= 44, `${id}: botón < 44 px`);
}
const box = await p.getByTestId("health-conflicts").boundingBox();
need(!!box && box.x + box.width <= 391, "el aviso se sale de 390 px");
await noHScroll("recovery");
const saved = (await (await p.request.get(B + `/api/recovery?from=${todayMadrid}&to=${todayMadrid}`)).json()) as Array<{ sleepHours: number; hrvSdnnMs: number; restingHr: number; bodyWeightKg: number }>;
need(saved[0]?.restingHr === 52 && saved[0]?.hrvSdnnMs === 48 && saved[0]?.sleepHours === 7.4 && saved[0]?.bodyWeightKg === 61, `lo guardado: ${JSON.stringify(saved[0])}`);
log("aviso visible, no se pisó lo anotado");

// 5) Elegir Apple Salud → el aviso desaparece y el peso cambia
await p.getByTestId("health-take-incoming").click();
await p.getByTestId("health-conflicts").waitFor({ state: "detached" });
const after = (await (await p.request.get(B + `/api/recovery?from=${todayMadrid}&to=${todayMadrid}`)).json()) as Array<{ bodyWeightKg: number }>;
need(after[0]?.bodyWeightKg === 63, `peso tras elegir: ${after[0]?.bodyWeightKg}`);
log("conflicto resuelto");

// 6) Distinto otra vez → nuevo aviso; «quedarme con lo anotado» y un reenvío igual no lo reabre
// Apple corrigiéndose a sí misma no avisa; solo si la usuaria anota otro peso a mano
await send({ date: todayMadrid, weightKg: 62 }, token);
need((await p.request.get(B + `/api/recovery?from=${todayMadrid}&to=${todayMadrid}`).then((r) => r.json()) as Array<{ bodyWeightKg: number }>)[0]?.bodyWeightKg === 62, "Apple debe poder corregir su propio valor sin aviso");
await p.request.post(B + "/api/recovery", { data: { date: todayMadrid, bodyWeightKg: 65 } });
await send({ date: todayMadrid, weightKg: 70 }, token);
await p.goto(B + "/recovery", { waitUntil: "load" });
await p.waitForTimeout(1500);
await p.getByTestId("health-keep-current").click();
await p.getByTestId("health-conflicts").waitFor({ state: "detached" });
await send({ date: todayMadrid, weightKg: 70 }, token);
await p.goto(B + "/recovery", { waitUntil: "load" });
await p.waitForTimeout(1000);
need((await p.getByTestId("health-conflicts").count()) === 0, "el aviso descartado no debe reabrirse");
log("quedarme con lo anotado");

// 7) Sin Atajos: importar el export.xml desde Ajustes (entrenos a la bandeja, métricas por día, lo anotado no se pisa)
const plusDay = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const yest = plusDay(todayMadrid, -1);
const exportXml = `<?xml version="1.0"?><HealthData>
<Record type="HKCategoryTypeIdentifierSleepAnalysis" startDate="${plusDay(todayMadrid, -2)} 23:00:00 +0200" endDate="${yest} 06:30:00 +0200" value="HKCategoryValueSleepAnalysisAsleepCore"/>
<Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" unit="ms" startDate="${yest} 03:00:00 +0200" endDate="${yest} 03:00:00 +0200" value="47"/>
<Record type="HKQuantityTypeIdentifierBodyMass" unit="kg" startDate="${todayMadrid} 07:00:00 +0200" endDate="${todayMadrid} 07:00:00 +0200" value="66.5"/>
<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="40" durationUnit="min" startDate="${yest} 08:30:00 +0200" endDate="${yest} 09:10:00 +0200">
 <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" sum="6.5" unit="km"/>
 <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" sum="420" unit="kcal"/>
</Workout></HealthData>`;
await p.goto(B + "/settings#apple-fitness", { waitUntil: "load" });
await p.waitForTimeout(1500);
await p.getByTestId("apple-file-import").locator("summary").click();
await p.getByLabel("Fichero export.xml de Apple Health").setInputFiles({ name: "export.xml", mimeType: "text/xml", buffer: Buffer.from(exportXml) });
const prev = p.getByLabel("Vista previa de Apple Health");
await prev.getByText(/2 días · último/).waitFor();
await prev.getByText(/1 entrenos · último: Correr/).waitFor();
await noHScroll("importar archivo");
await p.getByRole("button", { name: "Importar 2 días y 1 entrenos" }).click();
await p.getByText(/2 días importados · 1 entrenos a la bandeja · 1 avisos en Recuperación/).waitFor();
const pending = ((await (await p.request.get(B + "/api/training/apple-fitness/pending")).json()) as { items: unknown[] }).items;
need(Array.isArray(pending) && pending.length === 1, `bandeja tras importar: ${JSON.stringify(pending).slice(0, 200)}`);
const ry = (await p.request.get(B + `/api/recovery?from=${yest}&to=${yest}`).then((r) => r.json())) as Array<{ sleepHours: number; hrvSdnnMs: number; hrvRmssdMs: number | null }>;
need(ry[0]?.sleepHours === 7.5 && ry[0]?.hrvSdnnMs === 47 && ry[0]?.hrvRmssdMs == null, `métricas importadas: ${JSON.stringify(ry[0])}`);
// Reimportar el mismo fichero no duplica el entreno ni cambia nada
await p.reload({ waitUntil: "load" });
await p.waitForTimeout(1000);
await p.getByTestId("apple-file-import").evaluate((d) => ((d as HTMLDetailsElement).open = true));
await p.getByLabel("Fichero export.xml de Apple Health").setInputFiles({ name: "export.xml", mimeType: "text/xml", buffer: Buffer.from(exportXml) });
await p.getByRole("button", { name: "Importar 2 días y 1 entrenos" }).click();
await p.getByText(/0 entrenos a la bandeja \(1 ya estaban\)/).waitFor();
log("importar export.xml: entrenos a la bandeja, métricas por día y reimportación sin duplicar");

await browser.close();
if (errors.length) {
  console.error("✘", errors.join("\n✘ "));
  process.exit(1);
}
console.log("OK health");
