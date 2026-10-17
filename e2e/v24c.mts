// v2.4 bloque 3: perfil fuerza-velocidad (Samozino) a 390 px, claro y oscuro.
// Introduce 3 saltos con carga, ve F0, V0, Pmax y el desequilibrio, guarda y lo ve en el histórico.
// Falla con scroll horizontal o con un control < 44 px.
//   BASE_URL=http://localhost:3000 npm run e2e:v24c
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import { chromium, type Page } from "playwright-core";

const out = process.env.SHOTS_DIR ?? "e2e/screenshots";
mkdirSync(out, { recursive: true });
const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];
const URL_FV = "/training/tests/perfil-fv";

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const newPage = async (ip: string, colorScheme: "light" | "dark") => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "es-ES",
    hasTouch: true,
    isMobile: true,
    colorScheme,
    extraHTTPHeaders: { "x-forwarded-for": ip },
  });
  await ctx.addInitScript("window.__name = (f) => f;");
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
  page.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`);
  });
  return page;
};
const go = async (p: Page, u: string) => {
  await p.goto(B + u, { waitUntil: "load" });
  await p.waitForTimeout(400);
};
const newUser = (email: string, name: string) => {
  const o = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", name, "--role", "ATHLETE", "--accept-terms"], { encoding: "utf8" });
  const pw = o.match(/Contraseña: (\S+)/)?.[1];
  if (!pw) throw new Error(`no se pudo crear ${email}`);
  return pw;
};
const login = async (p: Page, email: string, pw: string) => {
  await go(p, "/login");
  await p.fill("#email", email);
  await p.fill("#password", pw);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login")), p.click("button[type=submit]")]);
};
const api = (p: Page, method: string, url: string, body?: unknown) =>
  p.evaluate(
    async ([m, u, b]) => {
      const r = await fetch(u as string, { method: m as string, headers: { "content-type": "application/json" }, body: b ? JSON.stringify(b) : undefined });
      let json: unknown = null;
      try { json = await r.json(); } catch { /* sin cuerpo */ }
      return { status: r.status, json };
    },
    [method, url, body] as const,
  );
const noHScroll = async (p: Page, where: string) => {
  if (await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) errors.push(`scroll horizontal en ${where}`);
};
const small = (p: Page) =>
  p.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("main a, main button:not([role=switch]), main select, main summary, main input:not([type=radio]):not([type=hidden]):not([type=file])")]
      .filter((e) => {
        if (e.tagName === "A" && (e.closest("p") || (e.parentElement?.textContent ?? "").trim().length - (e.textContent ?? "").trim().length > 8)) return false;
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.height < 43.5;
      })
      .map((e) => `${e.tagName.toLowerCase()}:${(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 24)}@${Math.round(e.getBoundingClientRect().height)}`),
  );
const measure = async (p: Page, tag: string) => {
  await noHScroll(p, `${URL_FV} (${tag})`);
  const bad = await small(p);
  if (bad.length) errors.push(`${URL_FV} (${tag}): controles < 44 px: ${[...new Set(bad)].join(", ")}`);
};

for (const scheme of ["light", "dark"] as const) {
  const email = `v24c-${scheme}-${Date.now()}@test.dev`;
  const pw = newUser(email, `Atleta F-V ${scheme}`);
  const page = await newPage(scheme === "light" ? "10.24.3.1" : "10.24.3.2", scheme);
  await login(page, email, pw);

  // La pestaña está en Tests y lleva a la página
  await go(page, "/training/tests");
  await page.getByRole("navigation", { name: "Secciones de tests" }).getByRole("link", { name: "Perfil F-V" }).click();
  await page.waitForURL((u) => u.pathname === URL_FV);
  await page.waitForTimeout(300);
  await measure(page, `${scheme} vacío`);

  // Menos de 2 cargas: mensaje claro y sin guardar
  await page.fill("#fv-mass", "70");
  await page.fill("#fv-hpo", "40");
  await page.fill("#fv-h-0", "32");
  const needs = await page.getByText(/al menos 2 saltos/).count();
  if (!needs) errors.push(`${scheme}: no avisa de que hacen falta al menos 2 cargas`);
  if (!(await page.getByRole("button", { name: "Guardar perfil" }).isDisabled())) errors.push(`${scheme}: deja guardar con 1 carga`);

  // 3 saltos con carga → F0, V0, Pmax y desequilibrio
  await page.fill("#fv-kg-1", "25");
  await page.fill("#fv-h-1", "24");
  await page.fill("#fv-kg-2", "50");
  await page.fill("#fv-h-2", "17");
  const card = page.getByLabel("Resultado del perfil F-V");
  await card.waitFor();
  const txt = (await card.textContent()) ?? "";
  for (const k of ["F0", "V0", "Pmax", "FVimb"]) if (!txt.includes(k)) errors.push(`${scheme}: el resultado no muestra ${k}: ${txt.slice(0, 120)}`);
  if (!/N\/kg/.test(txt) || !/W\/kg/.test(txt) || !/%/.test(txt)) errors.push(`${scheme}: faltan unidades en ${txt.slice(0, 160)}`);

  // Medidor de vídeo dentro del formulario: abre, es táctil y no guarda
  await page.getByRole("button", { name: "Medir con vídeo" }).first().click();
  await page.waitForTimeout(300);
  await measure(page, `${scheme} con medidor`);
  await page.getByRole("button", { name: "Cerrar medidor" }).click();

  await measure(page, `${scheme} relleno`);
  await page.screenshot({ path: `${out}/v24c-01-${scheme}-form.png`, fullPage: true });

  // Guardar y listar
  await page.getByRole("button", { name: "Guardar perfil" }).click();
  await page.locator("[data-fv-item]").first().waitFor({ timeout: 10000 });
  await go(page, URL_FV);
  const n = await page.locator("[data-fv-item]").count();
  if (n !== 1) errors.push(`${scheme}: el histórico tiene ${n} series (esperaba 1)`);
  const hist = (await page.locator("[data-fv-item]").first().textContent()) ?? "";
  if (!/Pmax/.test(hist) || !hist.includes("70 kg")) errors.push(`${scheme}: el histórico no muestra el perfil: ${hist.slice(0, 120)}`);
  await measure(page, `${scheme} con histórico`);
  await page.screenshot({ path: `${out}/v24c-02-${scheme}-historico.png`, fullPage: true });

  // API: 1 carga → 400 con motivo; el perfil no se ve en el resumen de datos de la IA (no hay endpoint: solo propio)
  const bad = await api(page, "POST", "/api/training/tests/fv", { date: "2026-10-17", bodyMassKg: 70, hpoCm: 40, loads: [{ addedKg: 0, heightCm: 30 }] });
  if (bad.status !== 400) errors.push(`${scheme}: 1 carga devolvió ${bad.status}`);
  const same = await api(page, "POST", "/api/training/tests/fv", { date: "2026-10-17", bodyMassKg: 70, hpoCm: 40, loads: [{ addedKg: 10, heightCm: 30 }, { addedKg: 10, heightCm: 28 }] });
  if (same.status !== 400) errors.push(`${scheme}: cargas iguales devolvió ${same.status}`);

  // Borrar
  await page.getByRole("button", { name: /Borrar serie/ }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-fv-item]").length === 0, null, { timeout: 10000 });
  await page.context().close();
  log(`${scheme}: perfil F-V (formulario, resultado, guardar, histórico, borrar) a 390 px sin scroll horizontal ni controles < 44 px`);
}

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v24c");
