// E2E de la v2.1 bloque 2 (biblioteca de ejercicios con vídeo propio) en un móvil de 390 px.
//   BASE_URL=http://localhost:3000 npm run e2e:v21b
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { chromium, type Page } from "playwright-core";

const out = process.env.SHOTS_DIR ?? "e2e/screenshots";
mkdirSync(out, { recursive: true });
const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];

// Clip de 1 s generado aquí (nada de binarios en el repo)
const tmp = mkdtempSync(path.join(tmpdir(), "atlenza-v21b-"));
const clip = path.join(tmp, "clip.webm");
execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=15:duration=1", "-c:v", "libvpx", "-b:v", "200k", clip]);
const big = path.join(tmp, "grande.webm");
writeFileSync(big, Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84]), Buffer.from("webm"), Buffer.alloc(26 * 1024 * 1024)]));
const fake = path.join(tmp, "falso.mp4");
writeFileSync(fake, "esto no es un vídeo");

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.220" } });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !/40[0134]|413|415|422/.test(m.text())) errors.push(`console ${page.url()}: ${m.text()}`);
});
page.on("response", (r) => {
  if (r.url().includes("/api/") && r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`);
});
const go = async (p: Page, u: string) => {
  await p.goto(B + u, { waitUntil: "load" });
  await p.waitForTimeout(300);
};
const noHScroll = async (where: string) => {
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) errors.push(`scroll horizontal en ${where}`);
};

const email = `v21b-${Date.now()}@e2e.test`;
const created = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", "Atleta v21b", "--role", "ATHLETE", "--accept-terms"], { encoding: "utf8" });
const pw = created.match(/Contraseña: (\S+)/)?.[1];
if (!pw) throw new Error("no se pudo crear el usuario");
await go(page, "/login");
await page.fill("#email", email);
await page.fill("#password", pw);
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);

// Biblioteca → nuevo ejercicio con instrucciones
await go(page, "/training");
await page.getByRole("link", { name: "Biblioteca de ejercicios" }).click();
await page.waitForURL(/\/training\/exercises$/);
await noHScroll("biblioteca 390 px");
await page.getByRole("button", { name: "+ Nuevo ejercicio" }).click();
await page.fill("#ex-name", "Sentadilla búlgara");
await page.fill("#ex-desc", "Pie trasero apoyado; tronco erguido; baja controlado.");
await page.getByRole("button", { name: "Crear" }).click();
await page.waitForURL(/\/training\/exercises\/[^/]+$/);
await page.getByText("Sin vídeo.").waitFor();
await noHScroll("ficha 390 px");
await page.screenshot({ path: `${out}/v21b-01-ficha.png`, fullPage: true });
log("ejercicio creado con instrucciones");

// Rechazos: tamaño (cliente) y tipo (servidor)
const input = page.getByLabel("Elegir vídeo");
await input.setInputFiles(big);
await page.getByRole("alert").getByText(/máx\. 25 MB/).waitFor();
await input.setInputFiles(fake);
await page.getByRole("alert").getByText(/MP4 o WebM/).waitFor();
log("vídeo >25 MB y fichero que no es vídeo rechazados");

// Subida y reproducción
await input.setInputFiles(clip);
await page.getByRole("button", { name: /Ver vídeo/ }).waitFor();
await page.getByRole("button", { name: "Ver vídeo", exact: false }).click();
const video = page.getByLabel("Vídeo de demostración");
await video.waitFor();
await page.waitForFunction(() => { const v = document.querySelector("video"); return !!v && v.readyState >= 2 && v.duration > 0; }, null, { timeout: 15000 });
if (!(await video.evaluate((v: HTMLVideoElement) => v.src.startsWith("blob:")))) errors.push("el vídeo no se reproduce desde un blob local");
await noHScroll("reproductor 390 px");
await page.screenshot({ path: `${out}/v21b-02-video.png`, fullPage: true });
log("el clip se sube y se reproduce desde la ficha (blob local)");

// Sin URL pública: otra sesión sin cookies no lo ve; el vídeo está cifrado en la API
const id = page.url().split("/").pop();
const anon = await browser.newContext();
const r = await anon.request.get(`${B}/api/training/exercises/${id}/video`);
if (r.status() !== 401 && r.status() !== 403) errors.push(`vídeo sin sesión → ${r.status()}`);
await anon.close();
const cc = await page.evaluate((i) => fetch(`/api/training/exercises/${i}/video`).then((x) => x.headers.get("cache-control")), id);
if (!cc?.includes("no-store")) errors.push(`cabecera de caché del vídeo: ${cc}`);
log("sin sesión no hay acceso y el vídeo no se cachea");

// Biblioteca lista el vídeo; borrar
await go(page, "/training/exercises");
await page.getByRole("link", { name: /Sentadilla búlgara/ }).getByText("Vídeo").waitFor();
await go(page, `/training/exercises/${id}`);
await page.getByRole("button", { name: "Borrar vídeo" }).click();
await page.getByText("Sin vídeo.").waitFor();
log("vídeo borrado");

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v21b");
