// v3.0 T · Accesibilidad manual y declaración: /legal/accesibilidad (V3), pasada automatizada de teclado (V3-A06/A11),
// alternativa en tabla de los gráficos de PMC, finanzas y composición (V3-A12), avisos de sonner anunciados (V3-A05),
// autenticación sin bloqueo de pegado (V3-A08) y ausencia de arrastre obligatorio (V3-A09).
//   BASE_URL=http://localhost:3000 npm run e2e:v30t
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { chromium, type Page } from "playwright-core";

import { a11y, WCAG22 } from "./a11y.mjs";

const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let ip = 120;
const newPage = async (colorScheme: "light" | "dark" = "light") => {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", colorScheme, extraHTTPHeaders: { "x-forwarded-for": `198.51.100.${ip++}` } });
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(`pageerror ${p.url()}: ${e.message}`));
  p.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`);
  });
  return p;
};
const go = async (p: Page, u: string) => {
  await p.goto(B + u, { waitUntil: "load" });
  await p.waitForLoadState("networkidle").catch(() => {});
};
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);

// 1. Declaración pública (sin sesión)
{
  for (const scheme of ["light", "dark"] as const) {
    const p = await newPage(scheme);
    const r = await p.goto(B + "/legal/accesibilidad", { waitUntil: "load" });
    if (r?.status() !== 200) errors.push(`/legal/accesibilidad → ${r?.status()}`);
    if ((await p.locator("h1").count()) !== 1) errors.push("declaración: debe haber un único h1");
    const text = await p.locator("main").innerText();
    if (!/parcialmente conforme/.test(text)) errors.push("declaración: no refleja el estado «parcialmente conforme»");
    if (/plenamente conforme|cumple totalmente/i.test(text)) errors.push("declaración: marca cumplimiento total");
    if (!/lector de pantalla/.test(text)) errors.push("declaración: no menciona la prueba pendiente con lector de pantalla");
    for (const v of await a11y(p, `/legal/accesibilidad (${scheme})`, WCAG22)) errors.push(v);
    if (await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) errors.push("declaración: scroll horizontal");
    const link = p.getByRole("link", { name: "Accesibilidad" });
    if (!(await link.count())) errors.push("el pie de /legal no enlaza a Accesibilidad");
    await p.context().close();
  }
  log("declaración pública: 200, un h1, estado parcial, axe WCAG 2.2 AA limpio en claro y oscuro");
}

// 2. Cuenta con datos mínimos
const email = `v30t-${Date.now()}@e2e.test`;
const pw = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", "Atleta T", "--role", "ATHLETE", "--accept-terms"], { encoding: "utf8" }).match(/Contraseña: (\S+)/)?.[1];
if (!pw) throw new Error("no se pudo crear la cuenta");
const login = async (p: Page) => {
  await go(p, "/login");
  await p.fill("#email", email);
  await p.fill("#password", pw);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login")), p.click("button[type=submit]")]);
};
const post = async (p: Page, url: string, data: unknown) => {
  const r = await p.request.post(B + url, { data });
  if (!r.ok()) errors.push(`siembra ${url}: ${r.status()} ${(await r.text()).slice(0, 120)}`);
  return r;
};
{
  const p = await newPage();
  await login(p);
  for (const d of [3, 2, 1]) await post(p, "/api/training/sessions", { date: iso(d), type: "STRENGTH", status: "COMPLETED", durationSec: 3600, sessionRpe: 7, strength: { sets: [] } });
  const accounts = (await (await p.request.post(B + "/api/finance/accounts", { data: { name: "Cuenta T", type: "ASSET", openingBalanceCents: 100000 } })).json()) as { id: string };
  const cats = (await (await p.request.get(B + "/api/finance/categories")).json()) as Array<{ id: string; kind: string }>;
  const exp = cats.find((c) => c.kind === "EXPENSE");
  if (exp) for (const d of [5, 40]) await post(p, "/api/finance/transactions", { mode: "simple", date: iso(d), kind: "EXPENSE", description: `Gasto ${d}`, amountCents: 1234, moneyAccountId: accounts.id, categoryId: exp.id });
  const base = { sex: "M", weightKg: 75, heightCm: 178, triceps: 10, subscapular: 9, biceps: 5, iliacCrest: 12, supraspinale: 7, abdominal: 12, frontThigh: 11, medialCalf: 6, armFlexedGirth: 33.5, calfGirth: 37, humerusBreadth: 7, femurBreadth: 9.8, wristBreadth: 5.7 };
  await post(p, "/api/health/body-composition", { ...base, date: iso(60) });
  await post(p, "/api/health/body-composition", { ...base, date: iso(2), weightKg: 77, triceps: 8 });
  await p.context().close();
}

// 3. Alternativa en tabla de los gráficos (V3-A12) y sin parada de teclado vacía
{
  const p = await newPage();
  await login(p);
  const CHARTS: Array<[string, string, RegExp, string]> = [
    ["PMC", "/training/performance", /Carga|fitness/i, "table"],
    ["Finanzas", "/finance/more", /meses?:/, "table"],
    ["Composición", "/nutrition/composition", /Última medición/, "table"],
  ];
  for (const [name, url, summary] of CHARTS) {
    await go(p, url);
    await p.waitForTimeout(800);
    const body = await p.locator("main").innerText();
    if (!summary.test(body)) errors.push(`${name}: falta el resumen en texto (${summary})`);
    const details = p.locator("main details", { has: p.locator("table") });
    const n = await details.count();
    if (!n) {
      errors.push(`${name}: no hay tabla alternativa`);
      continue;
    }
    await details.first().locator("summary").click();
    const t = details.first().locator("table");
    if (!(await t.locator("caption").count())) errors.push(`${name}: la tabla no tiene caption`);
    if (!(await t.locator("th[scope=col]").count())) errors.push(`${name}: la tabla no tiene th scope=col`);
    if (!(await t.locator("tbody tr").count())) errors.push(`${name}: la tabla no tiene filas`);
    // ningún SVG de recharts tabulable ni expuesto al lector de pantalla
    const bad = await p.evaluate(() => [...document.querySelectorAll(".recharts-wrapper, .recharts-surface")].filter((e) => e.getAttribute("tabindex") === "0" && !e.closest("[aria-hidden=true]")).length);
    if (bad) errors.push(`${name}: ${bad} elementos de recharts tabulables y visibles al lector`);
    if (await p.locator("main [role=application]").count()) errors.push(`${name}: role=application de recharts presente`);
  }
  log("gráficos PMC, finanzas y composición: resumen en texto + tabla con caption y th scope; recharts fuera del orden de tabulación");

  // 4. Avisos de sonner (V3-A05): región viva etiquetada antes del aviso y con el texto después
  await go(p, "/settings");
  const live = p.locator("section[aria-live=polite][aria-label^=Avisos]");
  if ((await live.count()) !== 1) errors.push(`sonner: región viva «Avisos» = ${await live.count()}`);
  await p.evaluate(() => fetch("/api/settings/prefs", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ highContrast: false }) }));
  const toastBtn = p.locator("main button:has-text('Guardar')").first();
  if (await toastBtn.count()) {
    await toastBtn.click();
    await p.waitForTimeout(600);
    const inLive = await live.locator("li, [data-sonner-toast]").count();
    if (!inLive) console.log("· sin aviso visible tras «Guardar» en /settings (la prueba del texto anunciado queda en la checklist manual)");
    else log("sonner: aviso dentro de la región viva «Avisos»");
  }
  log("sonner: una región aria-live=polite «Avisos» presente desde la carga");

  // 5. Teclado (V3-A06/A11): primer Tab = saltar al contenido → foco en main; sin trampas; foco visible y con nombre
  const KEY_ROUTES = ["/", "/training", "/planning", "/recovery", "/study", "/nutrition", "/finance", "/clubs", "/settings"];
  for (const r of KEY_ROUTES) {
    await go(p, r);
    await p.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await p.keyboard.press("Tab");
    const first = await p.evaluate(() => (document.activeElement as HTMLElement | null)?.textContent?.trim() ?? "");
    if (!/Saltar al contenido/.test(first)) errors.push(`${r}: el primer Tab no es «Saltar al contenido» (${first.slice(0, 30)})`);
    await p.keyboard.press("Enter");
    const onMain = await p.evaluate(() => document.activeElement?.tagName === "MAIN");
    if (!onMain) errors.push(`${r}: «Saltar al contenido» no mueve el foco a <main>`);
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      await p.keyboard.press("Tab");
      const info = await p.evaluate(() => {
        const e = document.activeElement as HTMLElement | null;
        if (!e || e === document.body) return null;
        const rect = e.getBoundingClientRect();
        const lab = (e as HTMLInputElement).labels?.[0]?.textContent ?? "";
        const name = (lab || e.getAttribute("aria-label") || e.getAttribute("aria-labelledby") || e.textContent || (e as HTMLInputElement).placeholder || e.getAttribute("title") || "").trim();
        const cs = getComputedStyle(e);
        const outline = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
        const ring = [e, e.parentElement, e.parentElement?.parentElement].some((n) => n && getComputedStyle(n).boxShadow !== "none");
        // no tapado por una barra fija inferior
        const cx = Math.min(Math.max(rect.left + rect.width / 2, 0), innerWidth - 1);
        const cy = Math.min(Math.max(rect.top + rect.height / 2, 0), innerHeight - 1);
        const top = document.elementFromPoint(cx, cy);
        const covered = !!top && !e.contains(top) && !top.contains(e);
        return { id: `${e.tagName}${(e as HTMLInputElement).type ? `[${(e as HTMLInputElement).type}]` : ""}#${e.id}:${name.slice(0, 40)}:${Math.round(rect.top)}`, tag: e.tagName, name, visible: rect.width > 0 && rect.height > 0, focusVisible: outline || ring, covered };
      });
      if (!info) break;
      if (!info.name && info.tag !== "MAIN") errors.push(`${r}: elemento enfocable sin nombre (${info.id})`);
      if (!info.visible) errors.push(`${r}: foco en elemento no visible (${info.id})`);
      if (info.covered) errors.push(`${r}: foco tapado por otro elemento (${info.id})`);
      if (!info.focusVisible) errors.push(`${r}: foco sin indicador visible (${info.id})`);
      seen.add(info.id);
    }
    if (seen.size < 3) errors.push(`${r}: el recorrido por teclado solo alcanzó ${seen.size} controles`);
  }
  log(`teclado: ${KEY_ROUTES.length} rutas — «Saltar al contenido», foco en main, orden sin trampa, foco visible, con nombre y no tapado`);
  await p.context().close();
}

// 6. Autenticación accesible (V3-A08) y sin arrastre obligatorio (V3-A09)
{
  const p = await newPage();
  await go(p, "/login");
  if (!(await p.getByRole("button", { name: /llave de acceso/i }).count())) errors.push("login: no ofrece entrar con llave de acceso");
  const pasted = await p.evaluate(() => {
    const el = document.querySelector<HTMLInputElement>("#password");
    if (!el) return "sin campo";
    const ev = new Event("paste", { cancelable: true, bubbles: true });
    el.dispatchEvent(ev);
    return ev.defaultPrevented ? "bloqueado" : "ok";
  });
  if (pasted !== "ok") errors.push(`login: pegar en la contraseña (${pasted})`);
  if ((await p.locator("#password").getAttribute("autocomplete")) == null) errors.push("login: #password sin autocomplete");
  await p.context().close();
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : /\.tsx?$/.test(f) ? [join(d, f)] : []));
  const drag = walk("src/components").concat(walk("src/app")).filter((f) => /\bdraggable\b|onDragStart|@dnd-kit/.test(readFileSync(f, "utf8")));
  if (drag.length) errors.push(`arrastre: ${drag.join(", ")}`);
  log("login: llave de acceso, pegado permitido, autocomplete; sin arrastre obligatorio en src");
}

await browser.close();
if (errors.length) {
  console.error("\n✘ Fallos:\n" + errors.map((e) => " - " + e).join("\n"));
  process.exit(1);
}
console.log("\nv3.0 T OK");
