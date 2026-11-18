// Importar historial (Excel/CSV) en /training a 390 px: plantillas, vista previa, guardar, carga en /training/performance y reimportar sin duplicar.
// Datos 100 % sintéticos (las plantillas del propio sistema + un CSV con título previo).
//   BASE_URL=http://localhost:3000 npm run e2e:historial
import { execFileSync } from "node:child_process";

import { chromium, type Page } from "playwright-core";

const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];
const need = (ok: boolean, msg: string) => { if (!ok) errors.push(msg); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.77" } });
await ctx.addInitScript("window.__name = (f) => f;");
const p: Page = await ctx.newPage();
p.on("pageerror", (e) => errors.push(`pageerror ${p.url()}: ${e.message}`));

const email = `hist-${Date.now()}@e2e.test`;
const o = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", "Atleta historial", "--role", "ATHLETE", "--accept-terms"], { encoding: "utf8" });
const pw = o.match(/Contraseña: (\S+)/)?.[1];
if (!pw) throw new Error("no se pudo crear la usuaria");

await p.goto(B + "/login", { waitUntil: "load" });
await p.waitForTimeout(4000); // hidratar antes de enviar el formulario
await p.fill("#email", email);
await p.fill("#password", pw);
await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login")), p.click("button[type=submit]")]);
await p.goto(B + "/training", { waitUntil: "load" });
await p.waitForTimeout(1500);

const noHScroll = async (tag: string) => need(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), `scroll horizontal (${tag})`);
const sheetOverflow = async (tag: string) => {
  const wide = await p.evaluate(() => { const s = document.querySelector("[data-testid=hist-sheet]") as HTMLElement | null; if (!s) return []; const lim = s.getBoundingClientRect().right; return [...s.querySelectorAll<HTMLElement>("*")].filter((e) => e.getBoundingClientRect().right > lim + 1).slice(0, 3).map((e) => `${e.tagName}.${String(e.className).slice(0, 40)} «${(e.textContent ?? "").slice(0, 30)}»`); });
  if (wide.length) console.log("ancho:", tag, wide);
  await sheetOverflowCheck(tag);
};
const sheetOverflowCheck = async (tag: string) =>
  need(!(await p.evaluate(() => { const s = document.querySelector("[data-testid=hist-sheet]") as HTMLElement | null; return !!s && s.scrollWidth > s.clientWidth + 1; })), `el panel se desborda (${tag})`);

const openSheet = async () => {
  await p.getByTestId("hist-open").click();
  await p.getByTestId("hist-file").waitFor();
};
const upload = async (name: string, mimeType: string, buffer: Buffer) => {
  await p.getByTestId("hist-file").setInputFiles({ name, mimeType, buffer });
  await p.getByTestId("hist-mapping").waitFor();
};
const review = async () => {
  await p.getByTestId("hist-review").click();
  await p.getByTestId("hist-counts").waitFor();
};

// 1) Plantillas descargables
await openSheet();
for (const [id, type] of [["hist-tpl-xlsx", "spreadsheetml"], ["hist-tpl-csv", "text/csv"]] as const) {
  const href = await p.getByTestId(id).getAttribute("href");
  const r = await ctx.request.get(B + href!);
  need(r.status() === 200 && (r.headers()["content-type"] ?? "").includes(type) && /attachment/.test(r.headers()["content-disposition"] ?? ""), `${id}: ${r.status()} ${r.headers()["content-type"]}`);
}
const xlsx = Buffer.from(await (await ctx.request.get(B + "/api/training/history-import/template?format=xlsx")).body());
const csv = Buffer.from(await (await ctx.request.get(B + "/api/training/history-import/template?format=csv")).body());
need(xlsx.subarray(0, 2).toString() === "PK", "la plantilla Excel no es un zip");
log("plantillas Excel y CSV descargables");

// 2) Subir la plantilla Excel → mapeo automático → vista previa → aceptar
await upload("plantilla.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xlsx);
need((await p.getByTestId("hist-map-date").inputValue()) === "0", "la fecha no se mapeó sola");
await noHScroll("mapeo");
await sheetOverflow("mapeo");
await review();
const c1 = (await p.getByTestId("hist-counts").textContent()) ?? "";
need(/5 nuevas · 0 duplicadas/.test(c1), `vista previa: «${c1}»`);
need((await p.getByTestId("hist-row").count()) === 5, "no salen 5 tarjetas");
need((await p.getByTestId("hist-noload").count()) === 0, "aviso de «sin carga» inesperado");
await sheetOverflow("vista previa");
await noHScroll("vista previa");
// Borrador: aún no hay nada guardado
const before = await p.evaluate(async () => (await (await fetch("/api/training/sessions?limit=50")).json()).length);
need(before === 0, `se guardó algo antes de aceptar (${before})`);
await p.getByTestId("hist-save").click();
await p.getByTestId("hist-done-text").waitFor();
need(/5 sesiones importadas · 0 ya existían/.test((await p.getByTestId("hist-done-text").textContent()) ?? ""), "resumen de la importación");
log("importación aceptada");

// 3) La carga se ve en /training/performance
const pmc = await p.evaluate(async () => (await fetch("/api/training/pmc?days=365")).json());
const series = (pmc.series ?? []) as Array<{ ctl: number; tss: number }>;
need(series.some((d) => d.tss > 0) && series.some((d) => d.ctl > 0), "la serie de carga no tiene TSS/CTL");
await p.getByRole("link", { name: "Ver carga" }).click();
await p.waitForURL(/\/training\/performance/);
await p.waitForTimeout(800);
await noHScroll("performance");
log(`carga: ${series.filter((d) => d.tss > 0).length} días con TSS`);

// 4) Reimportar el CSV (mismas sesiones): 0 nuevas, nada duplicado
await p.goto(B + "/training", { waitUntil: "load" });
await p.waitForTimeout(1500);
await openSheet();
await upload("plantilla.csv", "text/csv", csv);
await review();
const c2 = (await p.getByTestId("hist-counts").textContent()) ?? "";
need(/0 nuevas · 5 duplicadas/.test(c2), `reimportar: «${c2}»`);
need(await p.getByTestId("hist-save").isDisabled(), "importar debería estar desactivado sin nuevas");
const n = await p.evaluate(async () => (await (await fetch("/api/training/sessions?limit=50")).json()).length);
need(n === 5, `sesiones tras reimportar: ${n}`);
log("reimportar no duplica");
await p.keyboard.press("Escape");

// 5) CSV con título previo, sin duración/RPE: cabecera detectada, «sin carga» y valores por defecto
await openSheet();
const manual = Buffer.from("Mi registro de pruebas\n\nFecha;Sesión;Qué hice;Notas / dolor\n02/02/2026;Pista y gimnasio;Saltos y sentadilla;Sin molestias\n03/02/2026;Sin entrenar;;\n04/02/2026;Rodaje;Suave;\n", "utf8");
await upload("manual.csv", "text/csv", manual);
need((await p.getByTestId("hist-map-title").inputValue()) === "1", "no mapeó «Sesión» como título");
await review();
const c3 = (await p.getByTestId("hist-counts").textContent()) ?? "";
need(/2 nuevas · 0 duplicadas · 1 omitidas/.test(c3), `CSV manual: «${c3}»`);
need((await p.getByTestId("hist-noload").count()) === 1, "falta el aviso de filas sin carga");
await p.getByTestId("hist-def-dur").fill("45");
await p.getByTestId("hist-def-rpe").fill("5");
await review();
need((await p.getByTestId("hist-noload").count()) === 0, "con valores por defecto aún avisa de «sin carga»");
await p.getByTestId("hist-save").click();
await p.getByTestId("hist-done-text").waitFor();
const all = await p.evaluate(async () => (await (await fetch("/api/training/sessions?limit=50")).json()) as Array<{ title: string; tss: number | null; notes: string | null }>);
need(all.length === 7, `total de sesiones: ${all.length}`);
need(all.filter((s) => s.title === "Rodaje" || s.title === "Pista y gimnasio").every((s) => s.tss != null && /estimados/.test(s.notes ?? "")), "las sesiones con valores por defecto no tienen TSS/nota");
log("CSV con título previo, omitidos y valores por defecto");

await browser.close();
if (errors.length) {
  console.error("✘ Errores:\n" + errors.map((e) => " - " + e).join("\n"));
  process.exit(1);
}
log("historial OK: plantillas, vista previa, guardar, carga y reimportar sin duplicar a 390 px");
