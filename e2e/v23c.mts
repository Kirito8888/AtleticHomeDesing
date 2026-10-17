// E2E de la v2.3 bloque 3: Clubes, relación con entrenadoras y protocolos compartidos a 390 px.
// Sin scroll horizontal, controles ≥ 44 px (error, no aviso), accesos en ≤ 2 toques.
//   BASE_URL=http://localhost:3000 npm run e2e:v23c
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import { chromium, type Page } from "playwright-core";

const out = process.env.SHOTS_DIR ?? "e2e/screenshots";
mkdirSync(out, { recursive: true });
const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const newPage = async (ip: string, colorScheme: "light" | "dark", width = 390) => {
  const ctx = await browser.newContext({ viewport: { width, height: width > 600 ? 900 : 844 }, locale: "es-ES", hasTouch: width < 600, isMobile: width < 600, colorScheme, extraHTTPHeaders: { "x-forwarded-for": ip } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
  page.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`);
  });
  return page;
};
const go = async (p: Page, u: string) => {
  await p.goto(B + u, { waitUntil: "load" });
  await p.waitForTimeout(300);
};
const noHScroll = async (p: Page, where: string) => {
  if (await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) errors.push(`scroll horizontal en ${where}`);
};
const small = (p: Page) =>
  p.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("main a, main button:not([role=switch]), main select, main summary, main input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]), main [role=tab]")]
      .filter((e) => {
        if (e.tagName === "A" && e.closest("p")) return false;
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.height < 43.5;
      })
      .map((e) => `${e.tagName.toLowerCase()}:${(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 24)}@${Math.round(e.getBoundingClientRect().height)}`),
  );
const check = async (p: Page, url: string, tag: string) => {
  await go(p, url);
  await noHScroll(p, `${url} (${tag})`);
  const bad = await small(p);
  if (bad.length) errors.push(`${url} (${tag}): controles < 44 px: ${bad.join(", ")}`);
};
const call = (p: Page, method: string, url: string, body?: unknown) =>
  p.evaluate(
    async ([m, u, b]) => {
      const r = await fetch(u as string, { method: m as string, headers: { "content-type": "application/json" }, body: b ? JSON.stringify(b) : undefined });
      return { status: r.status, json: await r.json().catch(() => null) };
    },
    [method, url, body] as const,
  );
const newUser = (email: string, name: string, role: string) => {
  const o = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", name, "--role", role, "--accept-terms"], { encoding: "utf8" });
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

const stamp = Date.now();
const mail = (k: string) => `v23c-${k}-${stamp}@e2e.test`;
const pw = { coa: newUser(mail("coa"), "Entrenadora v23c", "COACH"), co2: newUser(mail("co2"), "Segunda entrenadora v23c", "COACH"), at: newUser(mail("at"), "Atleta v23c", "ATHLETE") };

for (const scheme of ["light", "dark"] as const) {
  const n = scheme === "light" ? 1 : 2;
  const coa = await newPage(`198.51.100.${250 + n}`, scheme);
  const at = await newPage(`198.51.100.${252 + n}`, scheme);
  await login(coa, mail("coa"), pw.coa);
  await login(at, mail("at"), pw.at);

  if (scheme === "light") {
    // Datos: vínculo con permiso de planificar, club con la atleta, un protocolo compartido
    await call(coa, "POST", "/api/coach/links", { athleteEmail: mail("at"), canPlan: true });
    const links = (await call(at, "GET", "/api/coach/links")).json as { asAthlete: Array<{ id: string }> };
    const r = await call(at, "PATCH", `/api/coach/links/${links.asAthlete[0].id}`, { status: "ACTIVE", canPlan: true, scopes: ["SESSIONS", "LOAD", "RECOVERY", "PLANNING"] });
    if (r.status >= 300) errors.push(`vínculo: HTTP ${r.status}`);
    const club = await call(coa, "POST", "/api/clubs", { name: "Club v23c" });
    const orgId = (club.json as { id?: string; org?: { id: string } } | null)?.id ?? (club.json as { org?: { id: string } } | null)?.org?.id;
    if (!orgId) errors.push(`crear club: HTTP ${club.status}`);
    else {
      await call(coa, "POST", `/api/clubs/${orgId}/members`, { email: mail("at"), role: "ATHLETE" });
      // v2.4 · el cambio de rol del staff queda en la Actividad de la persona afectada
      const co2 = await newPage("198.51.100.249", "light");
      await login(co2, mail("co2"), pw.co2);
      const inv = await call(coa, "POST", `/api/clubs/${orgId}/members`, { email: mail("co2"), role: "COACH" });
      const mid = (inv.json as { id?: string } | null)?.id;
      if (!mid) errors.push(`invitar staff: HTTP ${inv.status}`);
      else {
        const acc = await call(co2, "PATCH", `/api/clubs/${orgId}/members/${mid}`, { status: "ACTIVE" });
        const rol = await call(coa, "PATCH", `/api/clubs/${orgId}/members/${mid}`, { role: "ADMIN" });
        if (acc.status >= 300 || rol.status >= 300) errors.push(`cambio de rol: HTTP ${acc.status}/${rol.status}`);
        await go(co2, "/settings");
        if (!(await co2.getByText("rol: entrenadora → administración").count())) errors.push("la Actividad no muestra el cambio de rol");
      }
      await co2.context().close();
      await go(at, "/clubs");
      await at.getByRole("button", { name: "Aceptar" }).click();
      await at.getByRole("link", { name: /Club v23c/ }).waitFor();
    }
    const proto = await call(coa, "POST", "/api/recovery/physio", { title: "Tobillo v23c", phasesText: "# 1 · Calmar | dolor máx 2\n- Isométricos: 5×30 s\n? Sin dolor en reposo" });
    if (proto.status >= 300) log(`(protocolo por API: HTTP ${proto.status}; se usa el formulario)`);
  }

  const tag = scheme;
  // Atleta: clubes, club (sin paneles de staff) y fisio
  await check(at, "/clubs", `atleta ${tag}`);
  await at.getByRole("link", { name: /Club v23c/ }).first().tap();
  await at.waitForURL(/\/clubs\/[^/]+$/);
  await noHScroll(at, `club atleta (${tag})`);
  if (await at.getByRole("navigation", { name: "Secciones del club" }).count()) errors.push("la atleta ve el índice de staff");
  if (await at.locator("#alertas, #miembros").count()) errors.push("la atleta ve secciones de staff del club");
  await check(at, "/recovery/fisio", `atleta ${tag}`);

  // Entrenadora: clubes, club, coach, fisio
  await check(coa, "/clubs", `entrenadora ${tag}`);
  const hub = coa.getByRole("region", { name: "Accesos" });
  for (const name of ["Mis atletas", "Planificar varios", "Comentar en bloque", "Protocolos de fisio"]) {
    if (!(await hub.getByRole("link", { name }).count())) errors.push(`falta el acceso «${name}» (${tag})`);
  }
  await hub.getByRole("link", { name: "Mis atletas" }).tap();
  await coa.waitForURL("**/coach");
  await noHScroll(coa, `/coach (${tag})`);
  await check(coa, "/coach", `entrenadora ${tag}`);
  await check(coa, "/coach/multi", `entrenadora ${tag}`);
  await go(coa, "/clubs");
  await coa.getByRole("link", { name: /Club v23c/ }).first().tap();
  await coa.waitForURL(/\/clubs\/[^/]+$/);
  const clubUrl = new URL(coa.url()).pathname;
  await check(coa, clubUrl, `club staff ${tag}`);
  await coa.getByRole("navigation", { name: "Secciones del club" }).getByRole("link", { name: "Miembros" }).tap();
  if (!(await coa.locator("#miembros").count())) errors.push("falta #miembros");
  await coa.locator("details", { hasText: "Invitar a una persona" }).locator("summary").tap();
  await coa.locator("details", { hasText: "Apuntar una cuota" }).locator("summary").tap();
  await noHScroll(coa, `club con formularios abiertos (${tag})`);
  const open = await small(coa);
  if (open.length) errors.push(`club con formularios abiertos (${tag}): controles < 44 px: ${open.join(", ")}`);
  if (scheme === "light") await coa.screenshot({ path: `${out}/v23c-01-club.png`, fullPage: true });

  // Fisio (entrenadora): «Nuevo protocolo» plegado → crear → compartir
  await go(coa, "/recovery/fisio");
  if (await coa.locator("#pp-title:visible").count()) errors.push("«Nuevo protocolo» debería ir plegado");
  await coa.locator("details", { hasText: "Nuevo protocolo" }).locator("summary").tap();
  await noHScroll(coa, `fisio con editor abierto (${tag})`);
  const sm2 = await small(coa);
  if (sm2.length) errors.push(`fisio con editor abierto (${tag}): controles < 44 px: ${sm2.join(", ")}`);
  if (scheme === "light") await coa.screenshot({ path: `${out}/v23c-02-fisio.png`, fullPage: true });
  await coa.context().close();
  await at.context().close();
  log(`${scheme}: clubes, coach y fisio sin scroll horizontal y controles ≥ 44 px`);
}

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v23c");
