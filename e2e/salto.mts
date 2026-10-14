// E2E del medidor de salto en un móvil de 390 px (app con ALLOW_REGISTRATION=true; necesita DATABASE_URL).
// Genera con ffmpeg un WebM sintético de 240 fps; si no hay ffmpeg, lo dice y salta el paso del vídeo.
//   BASE_URL=http://localhost:3000 npm run e2e:salto
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium } from "playwright-core";

import { a11y } from "./a11y.mjs";

const out = process.env.SHOTS_DIR ?? "e2e/screenshots";
mkdirSync(out, { recursive: true });
const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.211" } });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !/40[0134]|422|503/.test(m.text())) errors.push(`console ${page.url()}: ${m.text()}`);
});
page.on("response", (r) => {
  if (r.url().includes("/api/") && r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`);
});
const go = async (u: string) => {
  await page.goto(B + u, { waitUntil: "load" });
  await page.waitForTimeout(300);
};
const checkA11y = async (where: string) => errors.push(...(await a11y(page, where)));

// Vídeo sintético: 2 s a 240 fps (480 fotogramas).
let video: Buffer | null = null;
try {
  const dir = mkdtempSync(join(tmpdir(), "salto-"));
  const file = join(dir, "salto.webm");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=240:duration=2", "-c:v", "libvpx", "-b:v", "500k", "-g", "1", file], { stdio: "pipe" });
  video = readFileSync(file);
  log("vídeo sintético generado con ffmpeg");
} catch {
  console.log("⚠ ffmpeg no disponible: se salta el paso del vídeo");
}

const email = `salto${Date.now()}@test.dev`;
const pw = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", "Atleta", "--accept-terms"], { encoding: "utf8" }).match(/Contraseña: (\S+)/)?.[1];
if (!pw) throw new Error("no se pudo crear la cuenta");
await go("/login");
await page.fill("#email", email);
await page.fill("#password", pw);
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);
log("cuenta e inicio de sesión");

await go("/training/tests");
await page.getByRole("link", { name: "Medir salto con vídeo" }).click();
await page.waitForURL(/\/training\/tests\/salto/);
await checkA11y("/training/tests/salto (sin vídeo)");

if (video) {
  const reqs: string[] = [];
  page.on("request", (r) => r.method() === "POST" && reqs.push(r.url()));
  await page.getByLabel(/^Vídeo del salto/).first().setInputFiles({ name: "salto.webm", mimeType: "video/webm", buffer: video });
  await page.getByText(/El fichero tiene/).waitFor({ timeout: 30_000 });
  await page.getByRole("radio", { name: "240 fps" }).click();
  await page.getByRole("radio", { name: "CMJ" }).click();
  const press = async (name: string, n: number) => {
    for (let i = 0; i < n; i++) await page.getByRole("button", { name, exact: true }).click();
  };
  await page.getByText(/^Fotograma/).waitFor();
  for (let k = 0; k < 3; k++) {
    // Vuelo de 120 fotogramas = 0,500 s → 30,7 cm y 2,45 m/s
    await page.getByRole("button", { name: "Marcar despegue" }).click();
    await press("+10", 12);
    await page.getByRole("button", { name: "Marcar aterrizaje" }).click();
    if (k === 0) {
      const r = page.getByTestId("jump-result");
      await r.getByText(/30,7 cm/).waitFor();
      await r.getByText(/2,45 m\/s/).waitFor();
      await checkA11y("/training/tests/salto (con resultado)");
      log("0,500 s → 30,7 cm y 2,45 m/s");
    }
    await page.getByRole("button", { name: "Añadir intento" }).click();
    await press("−10", 12); // vuelve atrás para el siguiente intento
  }
  await page.getByRole("list", { name: "Intentos" }).getByRole("listitem").nth(2).waitFor();
  await page.getByRole("button", { name: /^Guardar 3 intentos/ }).click();
  await page.waitForURL(/\/training\/tests$/);
  const body = page.getByLabel("Resultados por test");
  await body.getByText("Salto con contramovimiento (CMJ)", { exact: true }).first().waitFor();
  await body.getByText("CMJ · media de intentos", { exact: true }).first().waitFor();
  await body.getByText(/30,66 cm|30,7 cm/).first().waitFor();
  if (reqs.some((u) => /\.webm|video/.test(u))) errors.push("se subió el vídeo");
  await checkA11y("/training/tests (con saltos)");
  log("3 intentos guardados y visibles en /training/tests");
}

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
