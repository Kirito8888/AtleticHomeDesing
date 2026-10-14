// E2E de la v2.0 bloque E (varias réplicas: límite de peticiones en la BD) en un móvil de 390 px.
//   BASE_URL=http://localhost:3000 npm run e2e:v20e
import { execFileSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { mkdirSync } from "node:fs";

import { chromium } from "playwright-core";
import { Client } from "pg";

const out = process.env.SHOTS_DIR ?? "e2e/screenshots";
mkdirSync(out, { recursive: true });
const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];
const IP = "198.51.100.190";
const IP_OTHER = "198.51.100.191";
const LIMIT = 60; // LIMITS.sharedReport

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.189" } });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !/40[0134]|422|429/.test(m.text())) errors.push(`console ${page.url()}: ${m.text()}`);
});
page.on("response", (r) => {
  if (r.url().includes("/api/") && r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`);
});
const noHScroll = async (where: string) => {
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) errors.push(`scroll horizontal en ${where}`);
};

// 1. Iniciar sesión y navegar con normalidad
const email = `rep-${Date.now()}@e2e.test`;
const created = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", "Atleta Réplicas", "--role", "ATHLETE", "--accept-terms"], { encoding: "utf8" });
const pw = created.match(/Contraseña: (\S+)/)?.[1];
if (!pw) throw new Error("no se pudo crear el usuario");
await page.goto(B + "/login", { waitUntil: "load" });
await page.fill("#email", email);
await page.fill("#password", pw);
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);
for (const p of ["/", "/training", "/study", "/settings"]) {
  const r = await page.goto(B + p, { waitUntil: "load" });
  if (!r || r.status() >= 400) errors.push(`${p} → ${r?.status()}`);
  await noHScroll(`${p} 390 px`);
}
await page.screenshot({ path: `${out}/v20e-01-ajustes.png`, fullPage: true });
log("sesión iniciada y navegación normal");

// 2. Ruta protegida: pasa hasta el límite y luego 429 con Retry-After (contador en la BD)
const req = (ip: string) => ctx.request.get(`${B}/api/shared/health/token-falso-e2e`, { headers: { "x-forwarded-for": ip } });
let blocked = 0;
let retry = "";
for (let i = 1; i <= LIMIT + 2; i++) {
  const r = await req(IP);
  if (i <= LIMIT && r.status() === 429) errors.push(`bloqueo antes de tiempo en el intento ${i}`);
  if (i > LIMIT) {
    if (r.status() === 429) {
      blocked++;
      retry = r.headers()["retry-after"] ?? "";
    } else errors.push(`intento ${i} → ${r.status()} (esperaba 429)`);
  }
}
if (blocked !== 2) errors.push(`bloqueadas ${blocked} peticiones y debían ser 2`);
if (!(Number(retry) > 0)) errors.push(`Retry-After inválido: «${retry}»`);
if ((await req(IP_OTHER)).status() === 429) errors.push("otra IP también bloqueada");
log(`429 tras ${LIMIT} intentos (Retry-After ${retry} s); otra IP sigue pasando`);

// 3. El contador está en Postgres, con la clave cifrada (HMAC), no la IP en claro
const key = `sharedReport:${IP}`;
const secret = process.env.AUTH_SECRET;
const hashed = secret ? createHmac("sha256", secret).update(key).digest("hex") : createHash("sha256").update(key).digest("hex");
const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  const total = Number((await db.query('select coalesce(sum("count"),0) as n from "RateLimitHit" where "key" = $1', [hashed])).rows[0].n);
  if (total !== LIMIT + 2) errors.push(`el contador en BD es ${total} y debía ser ${LIMIT + 2}`);
  const clear = Number((await db.query('select count(*) as n from "RateLimitHit" where "key" like $1', [`%${IP}%`])).rows[0].n);
  if (clear) errors.push("la IP aparece en claro en RateLimitHit");
  await db.query('delete from "RateLimitHit" where "key" = any($1)', [[hashed, createHmac("sha256", secret ?? "").update(`sharedReport:${IP_OTHER}`).digest("hex"), createHash("sha256").update(`sharedReport:${IP_OTHER}`).digest("hex")]]);
} finally {
  await db.end();
}
log("contador en BD correcto y sin la IP en claro");

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v20e");
