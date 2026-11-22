// Apple Fitness/Salud · calibración y diagnóstico (v3.1 C) a 390 px: «Probar envío» en Ajustes, envíos reales con unidades y horas límite de Madrid,
// último envío visible (solo recuentos/campos), dryRun que no guarda y bandeja con «se creará como». Datos sintéticos.
//   BASE_URL=http://localhost:3000 npm run e2e:applediag
import { execFileSync } from "node:child_process";

import { chromium, type BrowserContext, type Page } from "playwright-core";

const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];
const need = (ok: boolean, msg: string) => { if (!ok) errors.push(msg); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx: BrowserContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.101" } });
const email = `appdiag-${Date.now()}@e2e.test`;
const o = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", "Atleta Diag", "--role", "ATHLETE", "--accept-terms"], { encoding: "utf8" });
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
const yesterday = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date(Date.now() - 86_400_000));

// 1) Ajustes: sin envíos todavía, token y «Probar envío»
await p.goto(B + "/settings#apple-fitness", { waitUntil: "load" });
await p.waitForTimeout(1500);
const diag = p.getByTestId("apple-diag");
need((await diag.innerText()).includes("Sin envíos todavía"), "debe poner «Sin envíos todavía»");
need(await p.getByTestId("apple-test").isDisabled(), "«Probar envío» debe estar desactivado sin token");
await p.getByTestId("apple-token-create").click();
await p.getByTestId("apple-token-fresh").waitFor();
const token = (await p.getByTestId("apple-token-value").innerText()).trim();
await p.getByTestId("apple-test").click();
await p.getByTestId("apple-test-result").waitFor();
const res = await p.getByTestId("apple-test-result").innerText();
need(/ha ido bien/.test(res) && /no se ha guardado ningún dato/.test(res) && !/✗/.test(res), `resultado de la prueba: ${res}`);
need(/Última prueba: .*Correcto/.test(await p.getByTestId("apple-diag-fitness").innerText()), "la última prueba de Entrenos debe quedar registrada");
const bb = await p.getByTestId("apple-test").boundingBox();
need(!!bb && bb.height >= 44, "«Probar envío» < 44 px");
await noHScroll("ajustes");
log("probar envío OK");

// 2) Envíos reales: unidades mezcladas y horas límite de Madrid
const send = (url: string, body: unknown, tok = token, q = "") => ctx.request.post(B + url + q, { data: body, headers: { authorization: `Bearer ${tok}` } });
const dry = await send("/api/training/apple-fitness", { type: "HIIT", start: `${todayMadrid}T08:00:00`, duration: "30 min" }, token, "?dryRun=1");
const dj = (await dry.json()) as { dryRun: boolean; workouts: Array<{ sessionType: string; date: string }> };
need(dry.status() === 200 && dj.dryRun && dj.workouts[0]?.sessionType === "MIXED" && dj.workouts[0]?.date === todayMadrid, `dryRun: ${JSON.stringify(dj)}`);
const fr = await send("/api/training/apple-fitness", { type: "Fuerza tradicional", start: `${yesterday}T23:50:00`, duration: "1 h 5 min", distance: "7,2 km", energyKj: "2008 kJ", hrAvg: "148 lpm" });
need(fr.status() === 200, `fitness: ${fr.status()}`);
const hr = await send("/api/recovery/apple-health", { sleepStart: `${yesterday}T23:40:00`, sleepEnd: `${todayMadrid}T07:10:00`, weightKg: "62,347 kg", restingHr: "52 lpm" });
need(hr.status() === 200, `salud: ${hr.status()}`);
const bad = await send("/api/recovery/apple-health", { date: todayMadrid, weightKg: "SECRETO kg" });
need(bad.status() === 400, `payload malo: ${bad.status()}`);
const saved = (await (await p.request.get(B + `/api/recovery?from=${todayMadrid}&to=${todayMadrid}`)).json()) as Array<{ sleepHours: number; bodyWeightKg: number; restingHr: number }>;
need(saved[0]?.sleepHours === 7.5 && saved[0]?.bodyWeightKg === 62.35 && saved[0]?.restingHr === 52, `lo guardado: ${JSON.stringify(saved[0])}`);
log("envíos con unidades, sueño → día del despertar");

// 3) Ajustes: último envío por vía, sin valores (reload: la misma URL con el mismo #hash no recarga)
await p.reload({ waitUntil: "load" });
await p.waitForTimeout(1500);
const f = await p.getByTestId("apple-diag-fitness").innerText();
const h = await p.getByTestId("apple-diag-health").innerText();
need(/Último envío: .*Correcto · (?=.*1 recibidos)(?=.*1 añadidos)/.test(f), `diagnóstico entrenos: ${f}`);
need(/Último envío: .*Datos rechazados: weightKg/.test(h), `diagnóstico salud: ${h}`);
need(!/SECRETO|62[.,]3|7200/.test(f + h), "el diagnóstico no debe mostrar valores");
await noHScroll("ajustes con diagnóstico");
log("diagnóstico visible");

// 4) Bandeja: «se creará como» y aislamiento del dryRun
await p.goto(B + "/training", { waitUntil: "load" });
await p.waitForTimeout(2000);
need((await p.getByTestId("apple-item").count()) === 1, "la bandeja debe tener solo el entreno real (el dryRun no guarda)");
need(/Fuerza/.test(await p.getByTestId("apple-create-as").innerText()), "debe decir que se creará como Fuerza");
await noHScroll("training");
log("bandeja: se creará como fuerza");

await browser.close();
if (errors.length) {
  console.error("✘", errors.join("\n✘ "));
  process.exit(1);
}
console.log("OK applediag");
