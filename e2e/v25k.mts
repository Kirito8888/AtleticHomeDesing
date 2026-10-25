// E2E del bloque «Estudio: resumen TDAH y esquema visual» en un móvil de 390 px (necesita build de producción, DATABASE_URL y LIFEOS_FAKE_AI=1).
//   BASE_URL=http://localhost:3000 npm run e2e:v25k
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import { chromium } from "playwright-core";

const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];
const out = process.env.SHOTS_DIR ?? "/tmp/e2e-out";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.181" } });
await ctx.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
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
  const h = (await loc.first().boundingBox())?.height ?? 0;
  if (h < 43.5) errors.push(`${what} mide ${h}px (< 44)`);
};
const toast = (re: RegExp) => page.locator("[data-sonner-toast]", { hasText: re }).first().waitFor({ timeout: 8000 });

const email = `v25k${Date.now()}@test.dev`;
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
const docCount = () => Number(psql(`select count(*) from "StudyDocument" where "userId"='${uid}'`));

const NOTES =
  "La **glucólisis** es la vía que convierte la glucosa en piruvato y ocurre en el citoplasma de la célula. Produce 2 ATP netos por molécula de glucosa. " +
  "Si hay oxígeno, el piruvato entra en la mitocondria para seguir oxidándose. Si no lo hay, se convierte en lactato para regenerar NAD+ y la vía puede continuar. " +
  "La regulación principal ocurre en la fosfofructoquinasa, que responde a la energía disponible. Es la base del metabolismo anaeróbico del músculo en esfuerzos intensos.";

await page.goto(B + "/study?tab=adapt");
await page.getByRole("tab", { name: "Resumir" }).waitFor();
await noOverflow("/study (pestañas)");
const tabs = page.getByRole("tablist").first();
const tb = await tabs.boundingBox();
if (!tb || tb.x < -0.5 || tb.x + tb.width > 391) errors.push("la lista de pestañas se sale de los 390 px");
log("pestaña «Resumir» visible");

// selector de formato
const group = page.getByRole("radiogroup", { name: "Formato" });
await minH(group.getByRole("radio", { name: "Resumen TDAH" }), "«Resumen TDAH»");
await minH(group.getByRole("radio", { name: "Esquema visual" }), "«Esquema visual»");
if ((await group.getByRole("radio", { name: "Resumen TDAH" }).getAttribute("aria-checked")) !== "true") errors.push("«Resumen TDAH» debería estar elegido por defecto");
await page.getByRole("radio", { name: "Texto", exact: true }).click();
await page.fill("#adapt-text", NOTES);
await minH(page.getByRole("button", { name: "Generar" }), "«Generar»");

// 1 · Resumen TDAH
await page.getByRole("button", { name: "Generar" }).click();
const summary = page.getByTestId("adapt-summary");
await summary.waitFor();
const blocks = summary.locator("[data-block]");
const n = await blocks.count();
if (n < 2) errors.push(`el resumen tiene ${n} bloques`);
for (let i = 0; i < n; i++) {
  const { h, lh, len } = await blocks.nth(i).evaluate((el) => ({ h: el.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(el).lineHeight), len: (el.textContent ?? "").length }));
  if (h > lh * 3 + 1) errors.push(`bloque ${i} ocupa ${Math.round(h / lh)} líneas (${len} car.)`);
}
if (!(await summary.locator("strong").count())) errors.push("el resumen no destaca ideas en negrita");
if (await summary.locator("em, i, u").count()) errors.push("el resumen usa cursiva/subrayado");
await noOverflow("resumen");
await page.screenshot({ path: `${out}/v25k-summary.png`, fullPage: true });
log(`resumen TDAH: ${n} bloques de ≤ 3 líneas, con negrita, sin desborde`);

// copiar
await minH(page.getByRole("button", { name: "Copiar" }), "«Copiar»");
await page.getByRole("button", { name: "Copiar" }).click();
await toast(/Copiado|No se pudo copiar/);
const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
if (clip && !clip.includes("## ")) errors.push("lo copiado no es el markdown del resumen");
if (docCount() !== 0) errors.push("copiar creó un apunte");

// guardar: cancelar no crea nada
await minH(page.getByRole("button", { name: "Guardar" }), "«Guardar»");
await page.getByRole("button", { name: "Guardar" }).click();
await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar" }).click();
await page.waitForTimeout(500);
if (docCount() !== 0) errors.push("cancelar el diálogo creó un apunte");
log("copiar y cancelar no guardan nada");

// 2 · Esquema visual (cambiar de formato regenera desde el mismo texto)
await group.getByRole("radio", { name: "Esquema visual" }).click();
await page.getByRole("button", { name: "Generar" }).click();
const outline = page.getByTestId("adapt-outline");
await outline.waitFor();
const depths = await outline.locator("li[data-depth]").evaluateAll((els) => Math.max(...els.map((e) => Number(e.getAttribute("data-depth")))));
if (depths < 1 || depths > 3) errors.push(`profundidad del esquema ${depths}`);
const x0 = (await outline.locator("li[data-depth='1']").first().boundingBox())?.x ?? 0;
const x1 = (await outline.locator("li[data-depth='2']").first().boundingBox())?.x ?? 0;
if (!(x1 > x0)) errors.push("el esquema no sangra los niveles");
await noOverflow("esquema");
await page.screenshot({ path: `${out}/v25k-outline.png`, fullPage: true });
log(`esquema visual: ${depths} niveles con sangría, sin desborde`);

// guardar: confirmar crea un apunte nuevo
await page.getByRole("button", { name: "Guardar" }).click();
await page.getByRole("alertdialog").getByRole("button", { name: "Guardar" }).click();
await toast(/Guardado en Apuntes/);
if (docCount() !== 1) errors.push(`tras confirmar hay ${docCount()} apuntes (esperaba 1)`);
if (psql(`select title from "StudyDocument" where "userId"='${uid}'`).startsWith("Esquema visual ·") === false) errors.push("el apunte guardado no lleva el nombre del formato");
await page.getByRole("tab", { name: "Apuntes" }).click();
await page.getByText(/Esquema visual ·/).first().waitFor();
await page.getByText("Listo").first().waitFor();
log("confirmar guarda un apunte nuevo, listo en Apuntes");

// 3 · desde ese apunte
await page.getByRole("tab", { name: "Resumir" }).click();
await page.getByRole("radio", { name: "Un apunte" }).click();
await page.getByRole("radiogroup", { name: "Formato" }).getByRole("radio", { name: "Resumen TDAH" }).click();
await page.getByRole("button", { name: "Generar" }).click();
await page.getByTestId("adapt-summary").waitFor();
await noOverflow("resumen desde apunte");
log("generar desde un apunte guardado");

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v25k");
