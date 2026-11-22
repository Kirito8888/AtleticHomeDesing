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

await browser.close();
if (errors.length) {
  console.error("✘", errors.join("\n✘ "));
  process.exit(1);
}
console.log("OK health");
