// E2E del bloque «Estudio: manual práctico en PDF» en un móvil de 390 px (necesita build de producción, DATABASE_URL, Chromium y LIFEOS_FAKE_AI=1).
//   BASE_URL=http://localhost:3000 npm run e2e:v25o
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";

import { chromium } from "playwright-core";
import { getDocumentProxy } from "unpdf";

const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];
const out = process.env.SHOTS_DIR ?? "/tmp/e2e-out";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, acceptDownloads: true, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.185" } });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
page.on("response", (r) => {
  if (r.url().includes("/api/") && r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`);
});

const email = `v25o${Date.now()}@test.dev`;
const created = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", "Atleta", "--role", "ATHLETE", "--accept-terms"], { encoding: "utf8" });
const pw = created.match(/Contraseña: (\S+)/)?.[1];
if (!pw) throw new Error("no se pudo crear la cuenta");
await page.goto(B + "/login");
await page.fill("#email", email);
await page.fill("#password", pw);
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);

await page.goto(B + "/study?tab=manual");
await page.getByRole("tab", { name: "Manual PDF" }).waitFor();
await page.getByRole("radio", { name: "Texto" }).click();
const btn = page.getByRole("button", { name: "Generar manual práctico PDF" });
if (!(await btn.isDisabled())) errors.push("el botón debía estar desactivado sin texto");
await page.locator("#manual-text").fill("Para preparar el servidor hay que abrir el puerto, editar la configuración y comprobar el resultado con una prueba.");
const h = (await btn.boundingBox())?.height ?? 0;
if (h < 43.5) errors.push(`botón mide ${h}px (< 44)`);
const w = await page.evaluate(() => document.documentElement.scrollWidth);
if (w > 392) errors.push(`desborda en horizontal (${w}px)`);
await page.screenshot({ path: `${out}/v25o-manual.png`, fullPage: true });

const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 90_000 }), btn.click()]);
if (!/^manual-practico-.*\.pdf$/.test(dl.suggestedFilename())) errors.push(`nombre inesperado ${dl.suggestedFilename()}`);
const path = await dl.path();
const buf = readFileSync(path);
if (buf.subarray(0, 5).toString() !== "%PDF-") errors.push("la descarga no es un PDF");
const doc = await getDocumentProxy(new Uint8Array(buf));
const texts: string[] = [];
for (let i = 1; i <= doc.numPages; i++) texts.push((await (await doc.getPage(i)).getTextContent()).items.map((it) => ("str" in it ? it.str : "")).join(""));
const real = texts.findIndex((t, i) => i > 1 && t.includes("@@A1@@")) + 1;
if (real < 3) errors.push("no se encontró la receta A1 en el cuerpo");
if (!new RegExp(`\\[A1\\][^\\[]*?${real}`).test(texts[1])) errors.push(`el índice de la pág. 2 no cita la página real ${real} de [A1]`);
if (!texts.at(-1)?.includes("Índice alfabético")) errors.push("falta el índice alfabético al final");
log(`descargado ${dl.suggestedFilename()} · ${doc.numPages} págs · [A1] en la pág. ${real}`);

const status = await page.evaluate(async () => (await fetch("/api/study/manual", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: { kind: "document", documentId: "no-existe" } }) })).status);
if (status !== 404) errors.push(`apunte inexistente devolvió ${status}`);

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v25o");
