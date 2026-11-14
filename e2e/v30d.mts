// E2E v3.0 · Bloque D (V3-S01): 2FA obligatoria para COACH/ADMIN pasada la fecha de corte.
// Necesita el servidor con STAFF_2FA_REQUIRED_FROM=2000-01-01 (e2e.sh lo arranca así) y DATABASE_URL.
//   sh scripts/dev/e2e.sh e2e:v30d
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import { chromium, type Page } from "playwright-core";

import { a11y } from "./a11y.mjs";

mkdirSync(process.env.SHOTS_DIR ?? "e2e/screenshots", { recursive: true });
const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

const user = (...a: string[]) => execFileSync("npm", ["run", "-s", "user", "--", ...a], { encoding: "utf8" });
const stamp = Date.now();
const email = `v30d-coach-${stamp}@test.invalid`;
const pw = user("create", email, "--name", "Entrenadora", "--role", "COACH", "--accept-terms").match(/Contraseña: (\S+)/)?.[1];
if (!pw) throw new Error("no se pudo crear la entrenadora");

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.230" } });
const p: Page = await ctx.newPage();
p.on("pageerror", (e) => errors.push(`pageerror ${p.url()}: ${e.message}`));

await p.goto(B + "/login", { waitUntil: "load" });
await p.fill("#email", email);
await p.fill("#password", pw);
await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login")), p.click("button[type=submit]")]);

// 1. Puerta: solo la pantalla de activación, sin menú ni datos
await p.goto(B + "/coach", { waitUntil: "load" });
await p.getByRole("heading", { name: "Activa la verificación en dos pasos" }).waitFor();
if (await p.locator("nav").count()) errors.push("la puerta de 2FA enseña el menú");
if (await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) errors.push("puerta 2FA: scroll horizontal a 390 px");
const small = await p.evaluate(() =>
  [...document.querySelectorAll("main button, main a, main input:not([type=hidden])")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 43.5; }).map((e) => (e.textContent || e.getAttribute("aria-label") || e.tagName).trim().slice(0, 30)),
);
if (small.length) errors.push(`puerta 2FA: objetivos < 44 px: ${small.join(", ")}`);
errors.push(...(await a11y(p, "puerta 2FA")));
log("puerta de 2FA: solo la pantalla de activación, 390 px sin scroll, objetivos ≥ 44 px, axe");

// 2. La API de datos responde 403 second_factor y la de configuración no
const api = await p.request.get(B + "/api/coach/links");
const body = await api.json().catch(() => ({}));
if (api.status() !== 403 || body?.details?.code !== "second_factor") errors.push(`/api/coach/links sin 2FA: ${api.status()} ${JSON.stringify(body)}`);
log("API de datos: 403 second_factor");

// 3. Activa una llave de acceso desde la puerta y entra
const cdp = await ctx.newCDPSession(p);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await p.getByLabel("Nombre de la llave").fill("Llave de prueba");
await p.getByRole("button", { name: "Añadir llave" }).click();
await p.getByRole("heading", { name: "Activa la verificación en dos pasos" }).waitFor({ state: "detached", timeout: 15000 });
await p.goto(B + "/coach", { waitUntil: "load" });
if (await p.getByRole("heading", { name: "Activa la verificación en dos pasos" }).count()) errors.push("sigue la puerta tras activar la llave");
const ok = await p.request.get(B + "/api/coach/links");
if (ok.status() !== 200) errors.push(`/api/coach/links con llave: ${ok.status()}`);
log("con llave de acceso activada la entrenadora entra");

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v30d");
