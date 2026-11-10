// E2E «Composición corporal ISAK» (v2.9 · bloque A) en móvil de 390 px (necesita build de producción y DATABASE_URL).
//   BASE_URL=http://localhost:3000 npm run e2e:v29a
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

import { chromium } from "playwright-core";

import { a11y } from "./a11y.mjs";

const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", extraHTTPHeaders: { "x-forwarded-for": "198.51.100.177" } });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
page.on("dialog", (d) => {
  errors.push(`diálogo nativo (${d.type()}): ${d.message()}`);
  void d.dismiss();
});

const email = `v29a${Date.now()}@test.dev`;
const out = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", "Amiga", "--role", "ATHLETE", "--accept-terms"], { encoding: "utf8" });
const pw = out.match(/Contraseña: (\S+)/)?.[1];
if (!pw) throw new Error("no se pudo crear la cuenta");
await page.goto(B + "/login");
await page.fill("#email", email);
await page.fill("#password", pw);
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);

// 1 · Acceso desde /nutrition
await page.goto(B + "/nutrition");
await page.getByRole("link", { name: "Composición corporal" }).click();
await page.waitForURL("**/nutrition/composition");
await page.getByRole("heading", { name: "Composición corporal" }).first().waitFor();
log("enlace desde /nutrition");

// 2 · Validación de rangos
await page.fill("#isak-weightKg", "10");
await page.getByRole("button", { name: "Calcular" }).click();
await page.getByText("Fuera del rango fisiológico").first().waitFor();
await page.getByText("Obligatorio").first().waitFor();
log("validación de rangos y obligatorios");

// 3 · Manual: calcular, confirmar y guardar
const v: Record<string, string> = { weightKg: "75", heightCm: "178", triceps: "10", subscapular: "9", biceps: "5", iliacCrest: "12", supraspinale: "7", abdominal: "12", frontThigh: "11", medialCalf: "6", armFlexedGirth: "33,5", calfGirth: "37", humerusBreadth: "7", femurBreadth: "9,8", wristBreadth: "5,7" };
for (const [k, val] of Object.entries(v)) await page.fill(`#isak-${k}`, val);
await page.selectOption("#isak-sex", "M");
await page.getByRole("button", { name: "Calcular" }).click();
const res = page.getByLabel("Resultado ISAK");
await res.waitFor();
const txt = await res.innerText();
if (!/2,49\s*–\s*5,05\s*–\s*2,32/.test(txt)) errors.push(`somatotipo inesperado: ${txt.slice(0, 120)}`);
if (!/Masa muscular/.test(txt) || !/Masa residual/.test(txt)) errors.push("faltan las 4 masas");
await page.getByRole("button", { name: "Guardar medición" }).click();
const dlg = page.getByRole("alertdialog");
await dlg.waitFor();
errors.push(...(await a11y(page, "confirmación de guardado")));
await dlg.getByRole("button", { name: "Guardar", exact: true }).click();
await page.getByRole("cell", { name: "75" }).first().waitFor();
log("manual: cálculo, confirmación y guardado en el histórico");

// 4 · Importar CSV de 2 filas (una válida, una con error)
mkdirSync("/tmp/atlenza-shots", { recursive: true });
const csv = [
  "fecha;sexo;peso;talla;triceps;subescapular;biceps;cresta_iliaca;supraespinal;abdominal;muslo_anterior;pierna_medial;brazo_flexionado;perimetro_pierna;humero;femur;muneca",
  "2026-10-01;M;74;178;11;9;5;12;7;12;11;6;33;37;7;9,8;5,7",
  "2026-10-02;M;5;178;11;9;5;12;7;12;11;6;33;37;7;9,8;5,7",
].join("\n");
writeFileSync("/tmp/atlenza-shots/isak.csv", csv);
await page.setInputFiles('input[type=file]', "/tmp/atlenza-shots/isak.csv");
await page.getByRole("button", { name: "Vista previa" }).click();
await page.getByLabel("Vista previa de la importación").waitFor();
const pv = await page.getByLabel("Vista previa de la importación").innerText();
if (!/2 filas · 1 válidas/.test(pv)) errors.push(`vista previa inesperada: ${pv.slice(0, 120)}`);
errors.push(...(await a11y(page, "vista previa de importación")));
await page.getByRole("button", { name: "Importar 1 mediciones" }).click();
await page.getByRole("alertdialog").getByRole("button", { name: "Importar", exact: true }).click();
await page.getByRole("cell", { name: "2026-10-01", exact: true }).waitFor();
log("importar CSV: vista previa, confirmación e histórico");

// 4b · Bloque B: somatocarta, 4 masas y evolución con 2 mediciones
const chart = page.getByRole("img", { name: /^Somatocarta: 2 mediciones/ });
await chart.waitFor();
if ((await page.getByTestId("punto-somato").count()) !== 2) errors.push("la somatocarta debe tener 2 puntos");
if ((await page.getByTestId("trayectoria").count()) !== 1) errors.push("falta la trayectoria entre mediciones");
if (!/variación frente al/.test(await page.locator("caption", { hasText: "variación frente al" }).innerText())) errors.push("falta la variación frente a la previa");
await page.getByText("Ver datos de la evolución").click();
await page.getByRole("cell", { name: "75", exact: true }).first().waitFor();
await page.locator(".recharts-wrapper").first().waitFor();
await page.getByRole("button", { name: "Porcentaje" }).click();
await page.locator(".recharts-wrapper").first().waitFor();
log("somatocarta (2 puntos + trayectoria), 4 masas con variación y evolución");

// 5 · Borrar una medición
await page.getByRole("button", { name: "Borrar la medición del 2026-10-01" }).click();
await page.getByRole("alertdialog").getByRole("button", { name: "Borrar", exact: true }).click();
await page.getByRole("cell", { name: "2026-10-01", exact: true }).waitFor({ state: "detached" });
log("borrado confirmado");

const w = await page.evaluate(() => document.documentElement.scrollWidth);
if (w > 392) errors.push(`desborda en horizontal (${w}px)`);
errors.push(...(await a11y(page, "/nutrition/composition")));

// Tema oscuro: sin desbordes ni fallos de accesibilidad en las gráficas
await page.emulateMedia({ colorScheme: "dark" });
await page.evaluate(() => document.documentElement.classList.add("dark"));
await page.getByRole("img", { name: /^Somatocarta/ }).waitFor();
const wd = await page.evaluate(() => document.documentElement.scrollWidth);
if (wd > 392) errors.push(`desborda en oscuro (${wd}px)`);
errors.push(...(await a11y(page, "/nutrition/composition (oscuro)")));

await browser.close();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("OK v29a");
