// E2E P1: /study, /recovery y /nutrition no deben usar eval ni new Function en el cliente
// (la CSP de producción no admite 'unsafe-eval'). Necesita build de producción, DATABASE_URL y Chromium.
//   BASE_URL=http://localhost:3000 npm run e2e:noeval
import { execFileSync } from "node:child_process";

import { chromium } from "playwright-core";

const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", extraHTTPHeaders: { "x-forwarded-for": "198.51.100.186" } });
// Registra cada violación CSP antes de que cargue cualquier script de la página.
await ctx.addInitScript(() => {
  (window as unknown as { __csp: string[] }).__csp = [];
  document.addEventListener("securitypolicyviolation", (e) => {
    (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`);
  });
});
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && /Content Security Policy|unsafe-eval|EvalError/i.test(m.text())) errors.push(`consola ${page.url()}: ${m.text()}`);
});

const email = `noeval${Date.now()}@test.dev`;
const created = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", "Atleta", "--role", "ATHLETE", "--accept-terms"], { encoding: "utf8" });
const pw = created.match(/Contraseña: (\S+)/)?.[1];
if (!pw) throw new Error("no se pudo crear la cuenta");
await page.goto(B + "/login");
await page.fill("#email", email);
await page.fill("#password", pw);
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);

const routes = ["/study", "/study?tab=manual", "/study/plan", "/recovery", "/recovery/trends", "/recovery/body", "/recovery/health", "/nutrition", "/nutrition/plan", "/nutrition/recipes", "/nutrition/micros", "/nutrition/composition"];
for (const r of routes) {
  await page.goto(B + r, { waitUntil: "networkidle" });
  const v = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
  for (const x of v) errors.push(`CSP ${r}: ${x}`);
}
log(`${routes.length} rutas sin violaciones CSP`);

await browser.close();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("Sin eval en /study, /recovery y /nutrition");
