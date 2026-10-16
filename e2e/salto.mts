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

// iPhone/PAL: .mov (QuickTime) de 2 s a 50 fps; si el Chromium de pruebas no decodifica H.264, se prueba VP9. Más un .mov ilegible.
let mov: Buffer | null = null;
let movVp9: Buffer | null = null;
try {
  const dir = mkdtempSync(join(tmpdir(), "salto-mov-"));
  const file = join(dir, "salto.mov");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=50:duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-g", "1", file], { stdio: "pipe" });
  mov = readFileSync(file);
  try {
    const f2 = join(dir, "salto-vp9.mov");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=50:duration=2", "-c:v", "libvpx-vp9", "-g", "1", "-f", "mp4", f2], { stdio: "pipe" });
    movVp9 = readFileSync(f2);
  } catch {}
  log(".mov sintético de 50 fps generado");
} catch {
  console.log("⚠ no se pudo generar el .mov: se salta el paso PAL/iPhone");
}
// Para los avisos: un fichero a 25 fps (iOS convirtió una grabación de 100) y uno a 30 fps que simula la cámara lenta exportada.
const clip = (name: string, rate: number, seconds: number, container: string, codec: string[]) => {
  try {
    const dir = mkdtempSync(join(tmpdir(), "salto-x-"));
    const file = join(dir, name);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `testsrc=size=320x240:rate=${rate}:duration=${seconds}`, ...codec, "-g", "1", "-f", container, file], { stdio: "pipe" });
    return readFileSync(file);
  } catch {
    return null;
  }
};
const clip25 = clip("c25.mov", 25, 4, "mp4", ["-c:v", "libvpx-vp9"]);
const clip30 = clip("c30.webm", 30, 8, "webm", ["-c:v", "libvpx"]);
const garbage = Buffer.from("esto no es un vídeo ".repeat(200));

const email = `salto${Date.now()}@test.dev`;
const pw = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", "Atleta", "--accept-terms"], { encoding: "utf8" }).match(/Contraseña: (\S+)/)?.[1];
if (!pw) throw new Error("no se pudo crear la cuenta");
await go("/login");
await page.fill("#email", email);
await page.fill("#password", pw);
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);
log("cuenta e inicio de sesión");

await go("/training/tests");
await page.getByRole("link", { name: "Medir salto", exact: true }).click();
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

if (mov) {
  await go("/training/tests/salto");
  await page.getByRole("radio", { name: "CMJ" }).click();
  const t0 = Date.now();
  const load = async (buf: Buffer) => {
    await page.getByLabel(/^Vídeo del salto/).first().setInputFiles({ name: "IMG_0001.mov", mimeType: "video/quicktime", buffer: buf });
    return Promise.race([
      page.getByText(/El fichero tiene \d+ fps|No se pudieron detectar/).waitFor({ timeout: 30_000 }).then(() => "ok"),
      page.getByRole("alert").filter({ hasText: /no puede leer/ }).waitFor({ timeout: 30_000 }).then(() => "codec"),
    ]);
  };
  let outcome = await load(mov);
  if (outcome === "codec" && movVp9) {
    console.log("⚠ el Chromium de pruebas no decodifica H.264: se prueba el .mov con VP9 (el mensaje de códec ya se ha comprobado)");
    log("H.264 no soportado → mensaje descriptivo, sin bloqueo");
    outcome = await load(movVp9);
  }
  if (outcome === "codec") {
    log("mensaje descriptivo de códec no soportado");
  } else {
    await page.getByRole("button", { name: "+1", exact: true }).waitFor();
    await page.getByText(/El fichero tiene 50 fps/).waitFor({ timeout: 10_000 });
    log(`.mov de iPhone listo para navegar en ${Date.now() - t0} ms (incluye detección de fps)`);
    await page.getByRole("radio", { name: "50 fps" }).click();
    const slider = page.getByRole("slider", { name: "Fotograma" });
    await slider.fill("10");
    await page.getByRole("button", { name: "Marcar despegue" }).click();
    // +1 / −1 rápidos: el contador responde al instante y el vídeo no se cuelga
    const t1 = Date.now();
    for (let i = 0; i < 25; i++) await page.getByRole("button", { name: "+1", exact: true }).click();
    await page.getByRole("button", { name: "−1", exact: true }).click();
    await page.getByRole("button", { name: "+1", exact: true }).click();
    await page.getByText(/Fotograma 35 de/).waitFor({ timeout: 2000 });
    log(`27 pasos de fotograma en ${Date.now() - t1} ms`);
    await page.getByRole("button", { name: "Marcar aterrizaje" }).click();
    // Vuelo de 25 fotogramas a 50 fps = 0,500 s → 30,7 cm
    await page.getByTestId("jump-result").getByText(/30,7 cm/).waitFor();
    await checkA11y("/training/tests/salto (.mov 50 fps)");
    await page.getByRole("button", { name: "Añadir intento" }).click();
    await page.getByRole("button", { name: /^Guardar 1 intento/ }).click();
    await page.waitForURL(/\/training\/tests$/);
    log(".mov a 50 fps (PAL) guardado");
  }

  const group = (name: string) => page.getByRole("radiogroup", { name, exact: true });
  const reload = async (name: string, mime: string, buffer: Buffer) => {
    await go("/training/tests/salto");
    await page.getByLabel(/^Vídeo del salto/).first().setInputFiles({ name, mimeType: mime, buffer });
    await page.getByText(/El fichero tiene \d+ fps/).waitFor({ timeout: 30_000 });
  };
  if (clip25) {
    // 4K a 100 fps que iOS convirtió a 25 fps: se calcula con 25 y se avisa; antes salían ~3 cm en vez de ~57
    await reload("convertido.mov", "video/quicktime", clip25);
    await page.getByText(/El fichero tiene 25 fps/).waitFor();
    await group("Fps de grabación").getByRole("radio", { name: "100 fps" }).click();
    await page.getByRole("alert").filter({ hasText: /Grabaste a 100 fps pero el vídeo que ha llegado tiene 25/ }).waitFor();
    await page.getByRole("slider", { name: "Fotograma" }).fill("48");
    await page.getByRole("button", { name: "Marcar despegue" }).click();
    await page.getByRole("slider", { name: "Fotograma" }).fill("65");
    await page.getByRole("button", { name: "Marcar aterrizaje" }).click();
    await page.getByTestId("jump-result").getByText(/56,7 cm/).waitFor();
    await page.getByText(/Se calcula con 25 fps \(fps del fichero\)/).waitFor();
    log("100 fps grabados → fichero de 25: aviso de conversión y 56,7 cm con 25 fps");
  }
  if (clip30) {
    // Cámara lenta exportada: 1 fotograma del fichero = 1 fotograma captado a 240
    await reload("lenta.webm", "video/webm", clip30);
    await group("Cámara lenta").getByRole("radio", { name: "Sí" }).click();
    await group("Fps de la cámara lenta").getByRole("radio", { name: "240 fps" }).click();
    await page.getByRole("slider", { name: "Fotograma" }).fill("10");
    await page.getByRole("button", { name: "Marcar despegue" }).click();
    await page.getByRole("slider", { name: "Fotograma" }).fill("130");
    await page.getByRole("button", { name: "Marcar aterrizaje" }).click();
    await page.getByTestId("jump-result").getByText(/30,7 cm/).waitFor();
    if (await page.getByRole("alert").filter({ hasText: /tramo lento|cámara lenta exportada/ }).count()) errors.push("aviso de cámara lenta innecesario");
    log("cámara lenta ×8 (30 → 240 fps): 120 fotogramas → 30,7 cm sin avisos");
    // …y si el tramo marcado va a velocidad real, avisa
    await page.getByRole("slider", { name: "Fotograma" }).fill("25");
    await page.getByRole("button", { name: "Marcar aterrizaje" }).click();
    await page.getByRole("alert").filter({ hasText: /no están en el tramo lento/ }).waitFor();
    log("cámara lenta marcada con el vuelo fuera del tramo lento: aviso");
  }
  await go("/training/tests/salto");
  await page.getByRole("heading", { name: "Cómo grabar y subir el vídeo para medir bien" }).waitFor();
  await page.getByText(/Colocar la cámara y ajustes de grabación/).waitFor();
  await page.getByText(/Error de ±1 fotograma|Cuantos más fps/).first().waitFor();
  for (const t of ["2 · Subir el vídeo y ajustarlo", "3 · Cómo se calcula", "4 · Para medidas más precisas"]) await page.getByText(t, { exact: false }).first().click();
  await page.getByText(/Guardar en Archivos/).waitFor();
  await page.getByText(/g · t² \/ 8/).waitFor();
  await page.getByText(/No lo compares con la tabla/).waitFor();
  await checkA11y("/training/tests/salto (guía)");
  log("guía de grabación visible");
  await page.getByLabel(/^Vídeo del salto/).first().setInputFiles({ name: "roto.mov", mimeType: "video/quicktime", buffer: garbage });
  await page.getByRole("alert").filter({ hasText: /no puede leer/ }).waitFor({ timeout: 15_000 });
  await checkA11y("/training/tests/salto (códec no soportado)");
  log("vídeo ilegible: mensaje descriptivo, sin bloqueo");
}

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
