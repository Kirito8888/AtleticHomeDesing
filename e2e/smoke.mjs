// Prueba de humo E2E de la UI: registra un usuario nuevo y recorre los módulos
// en un móvil de 390 px. Uso (con la app arrancada y la BD migrada + seed):
//   BASE_URL=http://localhost:3000 npm run e2e
// Variables: BASE_URL, CHROMIUM_PATH (opcional), SHOTS_DIR (capturas, opcional).
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const out = process.env.SHOTS_DIR ?? "e2e/screenshots";
mkdirSync(out, { recursive: true });
const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a) => console.log("✔", ...a);
const errors = [];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errors.push(`console ${page.url()}: ${m.text()}`); });
page.on("response", (r) => { if (r.url().includes("/api/") && r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`); });
const toast = async (re) => { await page.getByText(re).first().waitFor({ timeout: 15000 }); };
const shot = (n) => page.screenshot({ path: `${out}/e2e-${n}.png`, fullPage: true });
const go = async (u) => { await page.goto(u, { waitUntil: "load" }); await page.waitForTimeout(700); };
const email = `bea${Date.now()}@test.dev`;

// 1. Registro
await go(B + "/register");
await page.fill("#name", "Bea Lanzadora");
await page.fill("#email", email);
await page.fill("#password", "contraseña-segura-1");
await Promise.all([page.waitForURL(/\/settings\?welcome=1/), page.click("button[type=submit]")]);
log("registro → ajustes con bienvenida");

// 2. Perfil y umbrales
await page.selectOption("#p-sex", "FEMALE");
await page.fill("#p-weight", "68");
await page.selectOption("#p-disc", "THROWS");
await page.getByRole("button", { name: "Guardar perfil" }).click();
await toast("Perfil guardado");
await page.fill("#t-from", "2026-01-01");
await page.fill("#t-max", "192"); await page.fill("#t-rest", "52"); await page.fill("#t-lthr", "170"); await page.fill("#t-pace", "4:30");
await page.getByRole("button", { name: "Guardar umbrales" }).click();
await toast("Umbrales guardados");
await page.fill("#g-kcal", "2600"); await page.fill("#g-p", "140"); await page.fill("#g-c", "320"); await page.fill("#g-g", "80");
await page.getByRole("button", { name: "Guardar objetivo" }).click();
await toast("Objetivo guardado");
await shot("01-settings");
log("perfil, umbrales y objetivo guardados");

// 3. Sesión de fuerza
await go(B + "/training/new");
await page.getByLabel("Buscar ejercicio").fill("sentadilla tr");
await page.getByRole("button", { name: /Sentadilla trasera/ }).click();
// Serie 1 es calentamiento (20 kg x5). Repetir → serie 2 efectiva; subir peso a 100 con el input.
await page.getByRole("button", { name: "Repetir serie" }).click();
await page.getByRole("textbox", { name: "Peso serie 2", exact: true }).fill("100");
await page.getByRole("button", { name: "Sumar 2,5 a Peso serie 2" }).click(); // 102,5
await page.getByRole("radiogroup", { name: "RPE serie 2" }).getByRole("radio", { name: "8", exact: true }).click();
await page.getByRole("button", { name: "Repetir serie" }).click();
await page.getByRole("radiogroup", { name: "RPE serie 3" }).getByRole("radio", { name: "9", exact: true }).click();
await page.fill("#minutes", "60");
await page.getByRole("radiogroup", { name: "RPE de la sesión" }).getByRole("radio", { name: "7", exact: true }).click();
await shot("02-strength-form");
await Promise.all([page.waitForURL(/\/training\/c/), page.getByRole("button", { name: "Guardar sesión" }).click()]);
await page.getByText("sRPE (Foster)").waitFor();
await shot("03-strength-detail");
const tss = await page.locator("text=TSS").first().locator("..").innerText();
log("fuerza guardada:", tss.replace(/\s+/g, " "));

// 4. Sesión técnica (jabalina 600 g)
await go(B + "/training/new?type=TECHNICAL");
await page.getByRole("radiogroup", { name: "Peso del implemento" }).getByRole("radio", { name: "600 g" }).click();
for (const mark of ["48,30", "", "51,05"]) {
  await page.getByRole("button", { name: "Añadir intento" }).click();
  const i = await page.locator("ol > li").count();
  if (mark) await page.getByLabel(`Marca intento ${i} en metros`).fill(mark);
  else await page.locator("ol > li").nth(i - 1).getByRole("button", { name: "Nulo" }).click();
}
await page.getByText("Mejor: 51,05 m").waitFor();
await page.locator("ol > li").nth(2).getByText("Notas técnicas").click();
await page.locator("ol > li").nth(2).getByLabel("Suelta / ángulo").fill("Buen ángulo, codo alto");
await shot("04-technical-form");
await Promise.all([page.waitForURL(/\/training\/c/), page.getByRole("button", { name: "Guardar sesión" }).click()]);
await page.getByText(/Marca personal: 51,05 m/).waitFor();
log("jabalina guardada con marca personal 51,05 m");

// 5. Recuperación
await go(B + "/recovery");
await page.getByRole("textbox", { name: "Horas de sueño", exact: true }).fill("7,5");
await page.getByRole("radiogroup", { name: "Calidad del sueño" }).getByRole("radio", { name: "Buena", exact: true }).click();
await page.getByRole("radiogroup", { name: "DOMS" }).getByRole("radio", { name: "3", exact: true }).click();
await page.getByRole("radiogroup", { name: "Ánimo" }).getByRole("radio", { name: "Bueno", exact: true }).click();
await page.getByRole("button", { name: "Guardar y calcular readiness" }).click();
await toast(/Readiness: \d+/);
await page.waitForTimeout(800);
await shot("05-recovery");
log("recuperación →", await page.getByText(/Readiness: \d+/).first().innerText());

// 6. Nutrición manual
await go(B + "/nutrition");
await page.getByRole("button", { name: "Alimento" }).click();
await page.getByRole("tab", { name: "Manual" }).click();
await page.fill("#m-name", "Arroz con pollo"); await page.fill("#m-qty", "350"); await page.fill("#m-kcal", "620");
await page.fill("#m-p", "42"); await page.fill("#m-c", "80"); await page.fill("#m-g", "12");
await page.getByRole("tabpanel").getByRole("button", { name: "Añadir" }).click();
await toast("Añadido");
await page.getByText("Arroz con pollo").waitFor();
await shot("06-nutrition");
log("comida manual registrada");

// 7. Finanzas
await go(B + "/finance");
await page.getByRole("button", { name: /Gestionar/ }).click();
await page.fill("#a-name", "Cuenta nómina"); await page.fill("#a-open", "1500,00");
await page.getByRole("button", { name: "Crear cuenta" }).click();
await toast("Cuenta creada");
await page.getByRole("button", { name: "Movimiento" }).click();
await page.fill("#t-amount", "23,45"); await page.fill("#t-desc", "Zapatillas de clavos");
await page.getByRole("button", { name: "Guardar", exact: true }).click();
await toast("Movimiento guardado");
await page.getByText("1476,55").first().waitFor();
await shot("07-finance");
log("cuenta 1500 € − gasto 23,45 € = 1476,55 €");

// 8. Planificación
await go(B + "/planning");
await page.getByRole("button", { name: "Añadir" }).first().click();
await page.fill("#ev-title", "Campeonato de España");
await page.getByRole("button", { name: "Guardar evento" }).click();
await toast("Evento añadido");
await page.getByLabel("Nueva tarea").fill("Revisar vídeo del bloqueo");
await page.getByLabel("Prioridad", { exact: true }).selectOption("HIGH");
await page.getByRole("button", { name: /Añadir tarea|Añadir$/ }).last().click();
await page.getByText("Revisar vídeo del bloqueo").waitFor();
await shot("08-planning");
log("competición y tarea creadas");

// 9. Dashboard y Astras AI
await go(B + "/");
await page.getByText("Campeonato de España").waitFor();
await shot("09-dashboard");
await go(B + "/study");
await page.getByText(/La IA no está configurada/).waitFor();
await shot("10-study");
log("dashboard con competición; estudio avisa de falta de clave");

// 10. Rendimiento y tema oscuro
await go(B + "/training/performance?days=30");
await page.getByText("Carga: fitness, fatiga y forma").waitFor();
await page.emulateMedia({ colorScheme: "dark" });
await page.waitForTimeout(600);
await shot("11-performance-dark");

// Desbordes horizontales en todas las páginas, móvil y escritorio
for (const vw of [390, 1280]) {
  await page.setViewportSize({ width: vw, height: 844 });
  for (const p of ["/", "/training", "/training/new", "/training/performance", "/recovery", "/planning", "/nutrition", "/finance", "/study", "/settings"]) {
    await page.goto(B + p);
    await page.waitForTimeout(300);
    const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (o > 0) errors.push(`overflow ${vw}px ${p}: ${o}px`);
  }
}
await page.setViewportSize({ width: 1280, height: 800 });
await go(B + "/finance"); await page.waitForTimeout(500); await shot("12-finance-desktop");
await go(B + "/planning"); await page.waitForTimeout(300); await shot("13-planning-desktop");
await browser.close();
if (errors.length) {
  console.error("PROBLEMAS:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("Sin errores de consola, 5xx ni desbordes");
