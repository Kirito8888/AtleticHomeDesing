// v2.4 bloque 2 (P3-1…P3-3): tablas y rejillas con datos largos a 390 px, claro y oscuro, sin recorte ni scroll horizontal.
// Sesión sintética completa (fuerza, técnica, pista) con cifras y textos largos a propósito.
//   BASE_URL=http://localhost:3000 npm run e2e:v24b
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import { chromium, type Page } from "playwright-core";

const out = process.env.SHOTS_DIR ?? "e2e/screenshots";
mkdirSync(out, { recursive: true });
const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];

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
  await ctx.addInitScript("window.__name = (f) => f;"); // tsx inyecta __name en las funciones que se evalúan
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
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
const api = <T = unknown,>(p: Page, method: string, url: string, body?: unknown) =>
  p.evaluate(
    async ([m, u, b]) => {
      const r = await fetch(u as string, { method: m as string, headers: { "content-type": "application/json" }, body: b ? JSON.stringify(b) : undefined });
      let json: unknown = null;
      try { json = await r.json(); } catch { /* sin cuerpo */ }
      return { status: r.status, json };
    },
    [method, url, body] as const,
  ) as Promise<{ status: number; json: T }>;

// Mide, en el DOM, tablas y rejillas: desbordes sin contenedor con scroll y contenido recortado.
const measure = (p: Page) =>
  p.evaluate(() => {
    const bad: string[] = [];
    const main = document.querySelector("main") ?? document.body;
    const mr = main.getBoundingClientRect();
    const name = (e: Element) => `${e.tagName.toLowerCase()}${e.className && typeof e.className === "string" ? "." + e.className.split(/\s+/).slice(0, 3).join(".") : ""}`;
    const scrolls = (e: Element) => {
      for (let a: Element | null = e.parentElement; a && a !== document.body; a = a.parentElement) {
        const ox = getComputedStyle(a).overflowX;
        if (ox === "auto" || ox === "scroll") return true;
      }
      return false;
    };
    if (document.documentElement.scrollWidth > window.innerWidth) bad.push("scroll horizontal de la página");
    for (const t of main.querySelectorAll("table")) {
      const r = t.getBoundingClientRect();
      if (r.width === 0) continue;
      if (!scrolls(t) && (r.right > mr.right + 1 || r.left < mr.left - 1)) bad.push(`tabla fuera de main sin overflow-x: ${name(t)}`);
      if (!scrolls(t) && t.scrollWidth > t.clientWidth + 1) bad.push(`tabla desbordada sin overflow-x: ${name(t)}`);
    }
    for (const g of main.querySelectorAll<HTMLElement>("[class*=grid-cols-3], dl.grid")) {
      if (g.getBoundingClientRect().width === 0) continue;
      const cols = getComputedStyle(g).gridTemplateColumns.split(" ").length;
      for (const c of g.children) {
        const r = c.getBoundingClientRect();
        if (r.right > mr.right + 1 || r.left < mr.left - 1) bad.push(`columna fuera de main (${cols} col.): ${name(g)}`);
        for (const d of c.querySelectorAll<HTMLElement>("dd, dt, label, span, p, input")) {
          const dr = d.getBoundingClientRect();
          if (dr.width && d.scrollWidth > d.clientWidth + 1 && getComputedStyle(d).overflowX !== "visible") bad.push(`texto recortado (${cols} col.): ${(d.textContent || d.id).trim().slice(0, 30)}`);
          if (dr.width && dr.right > r.right + 1) bad.push(`contenido se sale de su columna (${cols} col.): ${(d.textContent || d.id).trim().slice(0, 30)}`);
        }
      }
    }
    return [...new Set(bad)];
  });
const check = async (p: Page, url: string, tag: string, shot?: string) => {
  const bad = await measure(p);
  if (shot) await p.screenshot({ path: `${out}/v24b-${shot}-${tag}.png`, fullPage: true });
  for (const b of bad) errors.push(`${url} (${tag}): ${b}`);
};

// ---------- Datos sintéticos (cifras y textos largos a propósito) ----------
const stamp = Date.now();
const email = `v24b-at-${stamp}@e2e.test`;
const pw = newUser(email, "Atleta v24b");
const day = (back: number) => new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10);
const seedP = await newPage("198.51.100.231", "light");
await login(seedP, email, pw);
await go(seedP, "/");
await api(seedP, "PATCH", "/api/profile", { primaryEvent: "jabalina", sex: "FEMALE", heightCm: 172, bodyWeightKg: 68 });
const ex = await api<{ id: string }[]>(seedP, "GET", "/api/training/exercises");
const exIds = (Array.isArray(ex.json) ? ex.json : []).slice(0, 3).map((e) => e.id);
if (exIds.length < 3) errors.push("no hay ejercicios en el catálogo");
const ids: Record<string, string> = {};
const post = async (k: string, body: unknown) => {
  const r = await api<{ id: string }>(seedP, "POST", "/api/training/sessions", body);
  if (r.status >= 300) errors.push(`sembrar ${k} → ${r.status} ${JSON.stringify(r.json).slice(0, 120)}`);
  else ids[k] = r.json.id;
};
for (let i = 0; i < 40; i++) {
  await api(seedP, "POST", "/api/training/sessions", { date: day(60 - i), type: "STRENGTH", status: "COMPLETED", durationSec: 3600, sessionRpe: 6 + (i % 4), strength: { sets: [{ exerciseId: exIds[0], reps: 5, weightKg: 100 + i, rpe: 7 }] } });
}
await post("STRENGTH", {
  date: day(1), type: "STRENGTH", status: "COMPLETED", durationSec: 5 * 3600 + 1980, sessionRpe: 9.5, discipline: "THROWS", title: "Fuerza máxima con un título francamente largo para estresar",
  strength: { bodyWeightKg: 68, sets: exIds.flatMap((id) => [0, 1, 2].map((s) => ({ exerciseId: id, reps: 12 + s, weightKg: 182.5 + s * 17.5, rpe: 9.5, rir: 0, restSec: 180 }))) },
});
await post("TECHNICAL", {
  date: day(2), type: "TECHNICAL", status: "COMPLETED", durationSec: 5400, sessionRpe: 7, discipline: "THROWS",
  technical: { event: "JAVELIN", implementWeightG: 600, videoTotal: 188, videoElbowOk: 144, videoHeadOk: 133, cue: "brazo largo", focus: "bloqueo de la pierna izquierda con apoyo prolongado", attempts: Array.from({ length: 9 }, (_, a) => ({ markM: 58.37 + a / 7, windMs: -1.4, runUpNotes: "carrera con ritmo irregular en los últimos pasos", blockNotes: "bloqueo tardío", releaseNotes: "suelta baja" })) },
});
await post("TRACK", {
  date: day(3), type: "TRACK", status: "COMPLETED", durationSec: 7200, sessionRpe: 8,
  track: { modality: "RUN", surface: "TRACK", distanceM: 21097, movingTimeSec: 5 * 3600 + 3599, hrAvg: 189, hrMax: 212, intervals: Array.from({ length: 6 }, (_, r) => ({ repetition: r + 1, distanceM: 10000, timeSec: 3599 + r * 61.37, recoverySec: 3600, hrAvg: 188, rpe: 9.5, isStartBlocks: r === 0, isFlying: r === 1, splitsSec: [1800.5, 1799.2] })) },
});
for (let i = 0; i < 8; i++) await api(seedP, "POST", "/api/training/recompute", {});
await api(seedP, "POST", "/api/training/minimums", { name: "Campeonato de España sub-23 de pruebas combinadas y lanzamientos", markM: 61.28, deadline: day(-30), implementWeightG: 600 });
log(`sesiones sembradas: ${Object.keys(ids).join(", ")}`);
await seedP.context().close();

const GPX = `<?xml version="1.0"?><gpx version="1.1" creator="e2e" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Rodaje largo de prueba con nombre muy extenso</name><trkseg>${Array.from({ length: 60 }, (_, i) => `<trkpt lat="${40 + i * 0.0009}" lon="-3.7"><ele>650</ele><time>2026-10-01T08:${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}Z</time></trkpt>`).join("")}</trkseg></trk></gpx>`;

// Autocomprobación: el medidor debe marcar una tabla ancha sin contenedor con scroll.
{
  const p = await newPage("198.51.100.234", "light");
  await login(p, email, pw);
  await go(p, "/goals");
  await p.evaluate(() => document.querySelector("main")!.insertAdjacentHTML("beforeend", '<table id="probe" style="width:900px"><tr><td>x</td></tr></table>'));
  if (!(await measure(p)).some((b) => b.includes("tabla"))) errors.push("autocomprobación: el medidor no detecta una tabla desbordada");
  await p.context().close();
}

for (const scheme of ["light", "dark"] as const) {
  const p = await newPage(scheme === "light" ? "198.51.100.232" : "198.51.100.233", scheme);
  await login(p, email, pw);
  for (const [k, id] of Object.entries(ids)) {
    await go(p, `/training/${id}`);
    await check(p, `/training/${k}`, scheme, `sesion-${k.toLowerCase()}`);
  }
  await go(p, "/training/performance");
  for (const d of await p.locator("main details > summary").all()) await d.click().catch(() => {});
  await p.waitForTimeout(300);
  await check(p, "/training/performance", scheme, "performance");
  await go(p, "/training/javelin");
  await check(p, "/training/javelin", scheme, "javelin");
  await go(p, "/training/new");
  for (const d of await p.locator("main details > summary").all()) await d.click().catch(() => {});
  await p.setInputFiles("input[type=file]", { name: "rodaje.gpx", mimeType: "application/gpx+xml", buffer: Buffer.from(GPX) }).catch(() => {});
  await p.waitForTimeout(1500);
  await check(p, "/training/new", scheme, "new");
  await p.getByRole("tab", { name: "Técnica" }).click();
  for (const d of await p.locator("main details > summary").all()) await d.click().catch(() => {});
  await p.fill("#videoTotal", "188").catch(() => errors.push("/training/new: falta #videoTotal (Vídeo contado)"));
  await p.waitForTimeout(300);
  await check(p, "/training/new (técnica)", scheme, "new-tecnica");
  await p.context().close();
  log(`barrido ${scheme}`);
}

await browser.close();
if (errors.length) {
  console.error("✘ Errores:\n" + errors.map((e) => " - " + e).join("\n"));
  process.exit(1);
}
log("v24b OK: sin recorte ni scroll horizontal en tablas y rejillas a 390 px (claro y oscuro)");
