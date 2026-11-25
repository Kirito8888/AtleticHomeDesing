// E2E del Bloque M de v3.2 (V3-N01, gasto energético adaptativo) en un móvil de 390 px (build de producción y DATABASE_URL).
//   BASE_URL=http://localhost:3000 npm run e2e:gasto
// 1) sin datos: «Aún calibrando» y ningún número · 2) 4 semanas de comida y peso: estimación con su «por qué» y
// borrador con tope semanal · 3) «Aceptar» escribe el objetivo (nada antes) · 4) menor de 18: solo mantener.
import { execFileSync } from "node:child_process";

import { chromium } from "playwright-core";

import { a11y } from "./a11y.mjs";

const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.183" } });
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

const email = `gasto${Date.now()}@test.dev`;
const out1 = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", "Gasto", "--role", "ATHLETE", "--accept-terms"], { encoding: "utf8" });
const pw = out1.match(/Contraseña: (\S+)/)?.[1];
if (!pw) throw new Error("no se pudo crear la cuenta");
await page.goto(B + "/login");
await page.fill("#email", email);
await page.fill("#password", pw);
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);

const dbUrl = (process.env.DATABASE_URL ?? "").replace(/\?.*/, "");
const psql = (sql: string) => execFileSync("psql", [dbUrl, "-Atqc", sql], { encoding: "utf8" }).trim();
const uid = psql(`select id from "User" where email='${email}'`);
const madridToday = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });

// 1 · Sin datos: calibrando, sin número inventado; se llega desde Nutrición
await page.goto(B + "/nutrition");
await page.getByTestId("nutrition-more").locator("summary").click();
await page.getByRole("link", { name: "Gasto energético" }).click();
await page.waitForURL("**/nutrition/gasto");
const card = page.getByTestId("expenditure-estimate");
await card.getByText("Aún calibrando").waitFor({ timeout: 8000 }).catch(() => errors.push("sin datos: no dice «Aún calibrando»"));
if (await page.getByTestId("expenditure-kcal").count()) errors.push("sin datos: enseña un gasto");
if (await page.getByTestId("expenditure-draft").count()) errors.push("sin datos: propone un objetivo");
await noOverflow("calibrando");
errors.push(...(await a11y(page, "gasto calibrando")));
log("sin datos: aún calibrando");

// 2 · 30 días comiendo 2400 kcal y bajando 0,2 kg/semana; objetivo actual 2300
const rows: string[] = [];
const weights: string[] = [];
for (let i = 1; i <= 30; i++) {
  const d = `('${madridToday}'::date - ${i})`;
  rows.push(`('m${Date.now()}a${i}','${uid}',${d},'LUNCH','Comida',500,1400,60,180,40)`, `('m${Date.now()}b${i}','${uid}',${d},'DINNER','Cena',400,1000,50,120,30)`);
  if (i % 3 === 0) weights.push(`('w${Date.now()}${i}','${uid}',${d},${(65 + (0.2 / 7) * i).toFixed(3)},now())`);
}
psql(`insert into "Macros"(id,"userId",date,"mealType","customName","quantityG",kcal,"proteinG","carbsG","fatG") values ${rows.join(",")}`);
psql(`insert into "RecoveryMetrics"(id,"userId",date,"bodyWeightKg","updatedAt") values ${weights.join(",")}`);
psql(`insert into "NutritionGoal"(id,"userId","effectiveFrom",kcal,"proteinG","carbsG","fatG") values ('g${Date.now()}','${uid}','${madridToday}'::date - 40,2300,120,300,65)`);
psql(`insert into "AthleteProfile"(id,"userId","birthDate","updatedAt") values ('p${Date.now()}','${uid}','1995-05-01',now()) on conflict ("userId") do update set "birthDate"='1995-05-01'`);

await page.reload();
const kcal = page.getByTestId("expenditure-kcal");
await kcal.waitFor({ timeout: 8000 }).catch(() => errors.push("con 4 semanas de datos no hay estimación"));
const n = Number((await kcal.innerText().catch(() => "")).replace(/\D/g, ""));
if (!(n >= 2600 && n <= 2640)) errors.push(`gasto estimado ${n} (se esperaba ≈ 2620)`);
const why = card.getByText("Por qué este número");
await minH(why, "«Por qué este número»");
await why.click();
if (!(await card.getByText(/2400|2\.400/).count())) errors.push("el «por qué» no dice la ingesta media");
const draft = page.getByTestId("draft-kcal");
if (Number((await draft.innerText().catch(() => "")).replace(/\D/g, "")) !== 2450) errors.push(`borrador ${await draft.innerText().catch(() => "—")} (se esperaba 2450: tope de 150 kcal/semana)`);
if (!(await page.getByTestId("expenditure-professional").count())) errors.push("falta la recomendación de un profesional");
await noOverflow("estimación");
errors.push(...(await a11y(page, "gasto con estimación")));
log(`estimación ≈ ${n} kcal y borrador de 2450`);

// 3 · La meta cambia el borrador; nada se escribe hasta «Aceptar»
const goals = page.getByRole("radiogroup", { name: "Meta de peso" });
await minH(goals.getByRole("radio", { name: "Bajar despacio" }), "«Bajar despacio»");
await goals.getByRole("radio", { name: "Bajar despacio" }).click();
await page.getByText("ya encaja con lo estimado").waitFor({ timeout: 8000 }).catch(() => errors.push("bajar: con 2300 ya cerca de gasto − 300 no debería proponer cambios"));
await goals.getByRole("radio", { name: "Mantener el peso" }).click();
await draft.waitFor({ timeout: 8000 });
if (psql(`select count(*) from "NutritionGoal" where "userId"='${uid}'`) !== "1") errors.push("se ha escrito un objetivo sin aceptar");
const accept = page.getByRole("button", { name: "Aceptar como objetivo desde hoy" });
await minH(accept, "«Aceptar»");
await accept.click();
await page.getByText(/Objetivo actualizado/).waitFor({ timeout: 8000 }).catch(() => errors.push("aceptar: sin confirmación"));
const written = psql(`select kcal || '|' || "proteinG" || '|' || "fatG" from "NutritionGoal" where "userId"='${uid}' and "effectiveFrom"='${madridToday}'`);
if (written !== "2450|120|65") errors.push(`aceptar: objetivo escrito «${written}» (se esperaba 2450|120|65)`);
log("aceptar escribe el objetivo de hoy; antes, nada");

// 4 · Menor de 18: solo «Mantener»
psql(`update "AthleteProfile" set "birthDate"='${madridToday}'::date - interval '16 years' where "userId"='${uid}'`);
await page.reload();
await goals.waitFor();
if (await goals.getByRole("radio", { name: "Bajar despacio" }).count()) errors.push("menor de 18: se ofrece bajar de peso");
log("menor de 18: solo mantener");

await browser.close();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("OK gasto");
