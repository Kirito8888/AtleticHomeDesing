// E2E de la v1.4 en un móvil de 390 px (app con ALLOW_REGISTRATION=true y LIFEOS_FAKE_AI=1:
// la CI no tiene clave de Gemini, así que el plan lo genera un simulador determinista).
//   BASE_URL=http://localhost:3000 npm run e2e:v14
import { mkdirSync } from "node:fs";

import { zipSync } from "fflate";
import { chromium } from "playwright-core";

import { mesoPdf } from "../src/test/plan-fixtures";

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
const shot = (n: string) => page.screenshot({ path: `${out}/v14-${n}.png`, fullPage: true });
const go = async (u: string) => {
  await page.goto(u, { waitUntil: "load" });
  await page.waitForTimeout(500);
};
const toast = (re: RegExp) => page.getByText(re).first().waitFor({ timeout: 30_000 });
const noOverflow = async (where: string) => {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  if (w > 392) errors.push(`${where}: desborda en horizontal (${w}px)`);
};
const radio = (group: string, name: string | RegExp) => page.getByRole("radiogroup", { name: group }).getByRole("radio", { name, exact: typeof name === "string" });
const check = (group: string, name: string | RegExp) => page.getByRole("group", { name: group }).getByRole("checkbox", { name, exact: typeof name === "string" });
const next = () => page.getByRole("button", { name: "Siguiente" }).click();

// 1. Registro y perfil de mujer
await go(B + "/register");
await page.fill("#name", "Atleta Prueba");
await page.fill("#email", `v14${Date.now()}@test.dev`);
await page.fill("#password", "contraseña-segura-1");
await Promise.all([page.waitForURL(/\/settings\?welcome=1/), page.click("button[type=submit]")]);
await page.selectOption("#p-sex", "FEMALE");
await page.getByRole("button", { name: "Guardar perfil" }).click();
await toast(/Perfil guardado/);
log("registro y perfil");

// 2. Cuestionario sin escribir
await go(B + "/study/plan");
await radio("Objetivo", "Ganar fuerza").click();
await next();
await radio("Nivel", /Intermedio/).click();
await radio("Edad", "18-29").click();
await next();
await check("Días de entrenamiento", "Mié").click(); // quita el miércoles: quedan lunes y viernes
await radio("Semanas", "4").click();
await next();
await radio("Sitio del Lunes", "Gimnasio").click();
await radio("Sitio del Viernes", "Casa").click();
await next();
await check("Material", "Gomas elásticas").click();
await next();
await check("Zonas con molestias", "Rodilla").click();
await check("Evitar", /Impactos/).click();
await next();
await next(); // intensidad y estilo por defecto
await radio("Adaptar al ciclo", "Sí").click();
await radio("Anticonceptivo hormonal", "No").click();
await check("Cuándo te cuesta más", "Durante la regla").click();
await shot("01-cycle-step");
await noOverflow("cuestionario");
await next();
// Seguridad: marcar una bloquea el plan
await check("Preguntas de seguridad", /Dolor en el pecho/).click();
await page.getByRole("alert").getByText(/profesional sanitario/).waitFor();
if (await page.getByRole("button", { name: /Generar mi plan/ }).isEnabled()) errors.push("con una respuesta de seguridad se puede generar el plan");
await check("Preguntas de seguridad", /Dolor en el pecho/).click();
await radio("Ninguna", "No, ninguna").click();
await page.getByRole("button", { name: /Generar mi plan/ }).click();
await page.waitForURL(/\/planning\/meso\/IA\d+/, { timeout: 60_000 });
log("plan generado:", page.url().split("/").pop());
await page.getByText(/Es un borrador/).waitFor();
await shot("02-draft");
await noOverflow("borrador");

// 3. Activar y ajustar un día
await page.getByRole("button", { name: "Activar en mis entrenamientos" }).click();
await toast(/Plan activado: \d+ sesiones/);
await page.waitForTimeout(800);
await page.getByRole("link", { name: /○/ }).first().click();
await page.waitForURL(/\/training\/c/);
await page.getByText("Plan del día").waitFor();
await page.getByRole("button", { name: "Usar versión suave" }).click();
await toast(/Versión suave para hoy/);
await page.getByText("Hoy usas la versión suave.").waitFor();
await page.getByRole("button", { name: "Volver a la normal" }).click();
await toast(/Vuelves a la versión normal/);
await page.getByText("Ajustar este día").click();
await radio("Sitio de hoy", "Casa").click();
await page.getByRole("button", { name: "Adaptar los ejercicios" }).click();
await toast(/ejercicios cambiados|sin alternativa|sin cambios/);
await page.waitForTimeout(800);
await page.getByText("Dónde").locator("..").getByText("Casa").waitFor();
await shot("03-day");
await noOverflow("día del plan");
log("versión suave y cambio de sitio");

// 4. Mi ciclo en Recuperación
await go(B + "/recovery");
const cycle = page.getByLabel("Mi ciclo");
await cycle.waitFor();
await check("Síntomas de hoy", "Fatiga").click();
await cycle.getByRole("button", { name: "Guardar hoy" }).click();
await toast(/Registrado/);
await page.waitForTimeout(600);
await page.getByText(/Hoy has marcado síntomas/).first().waitFor();
await shot("04-cycle");
await noOverflow("recuperación");
log("ciclo: síntomas → propuesta de versión suave");

// 5. Bloque A: tabla de RM → kg en el plan → registrar desde el plan (sesión mixta)
await go(B + "/planning");
await page.getByRole("button", { name: "Importar plan" }).click();
await page.locator("#plan-file").setInputFiles({ name: "plan.zip", mimeType: "application/zip", buffer: Buffer.from(zipSync({ "M5.pdf": mesoPdf() })) });
await page.getByLabel("Vista previa del plan").getByRole("button", { name: /^Importar \d+ días$/ }).click();
await toast(/Plan importado/);
await go(B + "/training/rm");
await page.fill("#rm-name", "Sentadilla frontal");
await page.fill("#rm-kg", "100");
await page.getByRole("button", { name: "Añadir" }).click();
await toast(/RM guardada/);
await page.getByLabel("RM vigentes").getByText("100 kg").waitFor();
// Serie de test: 85 kg × 6 → 102 kg (+2 %): no cambia; 90 × 8 → 114 kg (+14 %): sí
await page.fill("#t-kg", "85");
await radio("Repeticiones de la serie de test", "6").click();
await page.getByRole("button", { name: "Calcular" }).click();
await page.getByRole("status").getByText(/Diferencia pequeña/).waitFor();
await page.fill("#t-kg", "90");
await radio("Repeticiones de la serie de test", "8").click();
await page.getByRole("button", { name: "Calcular" }).click();
await page.getByRole("button", { name: "Guardar nueva RM" }).click();
await toast(/RM actualizada/);
await radio("Protocolo APRE", "APRE 6").click();
await radio("Repeticiones serie 3", "9").click();
await page.getByText(/sube 2,5-5 kg/).waitFor();
await shot("05-rm");
await noOverflow("mis RM");
log("tabla de RM, serie de test y APRE");

await go(`${B}/planning?month=2026-10&day=2026-10-27#dia`);
await page.getByRole("list", { name: "Sesiones del día" }).getByRole("link").first().click();
await page.waitForURL(/\/training\/c/);
await page.getByText("83 % · 95 kg").first().waitFor(); // 83 % de 114 = 94,6 → 95 (escalón 2,5)
await page.getByRole("link", { name: "Registrar" }).click();
await page.waitForURL(/\/edit$/);
const w1 = await page.getByRole("textbox", { name: "Peso serie 1", exact: true }).inputValue();
if (w1 !== "95") errors.push(`registrar desde el plan: peso precargado ${w1} (esperado 95)`);
await page.getByText(/Sesión mixta/).click();
await page.getByLabel("Guardar como planificada (no suma carga)").uncheck();
await Promise.all([page.waitForURL(/\/training\/c[^/]*$/), page.getByRole("button", { name: /^Guardar (cambios|sesión)$/ }).click()]);
await page.getByText("Sentadilla frontal").first().waitFor();
await shot("06-registered");
log("registrar desde el plan con kg precargados, como sesión mixta");

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v14");
