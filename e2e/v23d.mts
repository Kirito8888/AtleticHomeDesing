// E2E de la v2.3 bloque 4: Ajustes ordenados por grupos + barrido táctil final de las rutas estáticas a 390 px.
// Sin scroll horizontal; error (no aviso) si un control o la etiqueta de una casilla mide < 44 px.
//   BASE_URL=http://localhost:3000 npm run e2e:v23d
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import { chromium, type Page } from "playwright-core";

const out = process.env.SHOTS_DIR ?? "e2e/screenshots";
mkdirSync(out, { recursive: true });
const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const newPage = async (ip: string, colorScheme: "light" | "dark") => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "es-ES",
    hasTouch: true,
    isMobile: true,
    colorScheme,
    extraHTTPHeaders: { "x-forwarded-for": ip },
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) =>
    errors.push(`pageerror ${page.url()}: ${e.message}`),
  );
  page.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 500)
      errors.push(`HTTP ${r.status()} ${r.url()}`);
  });
  return page;
};
const go = async (p: Page, u: string) => {
  await p.goto(B + u, { waitUntil: "load" });
  await p.waitForTimeout(300);
};
const noHScroll = async (p: Page, where: string) => {
  if (
    await p.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    )
  )
    errors.push(`scroll horizontal en ${where}`);
};
// Controles interactivos + casillas (se mide la etiqueta que las envuelve o, si no, la propia casilla)
const small = (p: Page) =>
  p.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        "main a, main button:not([role=switch]), main select, main summary, main input:not([type=radio]):not([type=hidden]):not([type=file]), main [role=tab]",
      ),
    ]
      .map((e) =>
        e instanceof HTMLInputElement && e.type === "checkbox"
          ? (e.closest("label") ?? e)
          : e,
      )
      .filter((e) => {
        // Enlace en línea dentro de un texto (WCAG 2.5.8): hay texto propio en el mismo contenedor
        if (
          e.tagName === "A" &&
          (e.closest("p") ||
            (e.parentElement?.textContent ?? "").trim().length -
              (e.textContent ?? "").trim().length >
              8)
        )
          return false;
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.height < 43.5;
      })
      .map(
        (e) =>
          `${e.tagName.toLowerCase()}:${(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 24)}@${Math.round(e.getBoundingClientRect().height)}`,
      ),
  );
const check = async (p: Page, url: string, tag: string) => {
  await go(p, url);
  await noHScroll(p, `${url} (${tag})`);
  const bad = await small(p);
  if (bad.length)
    errors.push(
      `${url} (${tag}): controles < 44 px: ${[...new Set(bad)].join(", ")}`,
    );
};
const newUser = (email: string, name: string, role: string) => {
  const o = execFileSync(
    "npm",
    [
      "run",
      "-s",
      "user",
      "--",
      "create",
      email,
      "--name",
      name,
      "--role",
      role,
      "--accept-terms",
    ],
    { encoding: "utf8" },
  );
  const pw = o.match(/Contraseña: (\S+)/)?.[1];
  if (!pw) throw new Error(`no se pudo crear ${email}`);
  return pw;
};
const login = async (p: Page, email: string, pw: string) => {
  await go(p, "/login");
  await p.fill("#email", email);
  await p.fill("#password", pw);
  await Promise.all([
    p.waitForURL((u) => !u.pathname.startsWith("/login")),
    p.click("button[type=submit]"),
  ]);
};

const stamp = Date.now();
const mail = (k: string) => `v23d-${k}-${stamp}@e2e.test`;
const pw = {
  at: newUser(mail("at"), "Atleta v23d", "ATHLETE"),
  adm: newUser(mail("adm"), "Admin v23d", "ADMIN"),
};

const STATIC = [
  "/",
  "/glance",
  "/goals",
  "/notifications",
  "/review",
  "/safety",
  "/search",
  "/share",
  "/about",
  "/welcome",
  "/finance",
  "/finance/trips",
  "/nutrition",
  "/nutrition/micros",
  "/nutrition/plan",
  "/nutrition/recipes",
  "/nutrition/shopping",
  "/nutrition/sweat",
  "/planning",
  "/planning/plan/new",
  "/planning/week-all",
  "/recovery",
  "/recovery/body",
  "/recovery/fisio",
  "/recovery/health",
  "/recovery/trends",
  "/recovery/wellbeing",
  "/recovery/women",
  "/study",
  "/study/ask",
  "/study/assignments",
  "/study/exam",
  "/study/exams",
  "/study/focus",
  "/study/plan",
  "/study/schedule",
  "/training",
  "/training/new",
  "/training/compare",
  "/training/diary",
  "/training/equipment",
  "/training/exercises",
  "/training/javelin",
  "/training/performance",
  "/training/prehab",
  "/training/rm",
  "/training/routine",
  "/training/seasons",
  "/training/tests",
  "/training/tests/comparar",
  "/training/tests/curvas",
  "/training/tests/salto",
  "/settings/privacy",
  "/settings/trash",
  "/clubs",
];

for (const scheme of ["light", "dark"] as const) {
  const n = scheme === "light" ? 1 : 2;
  const at = await newPage(`198.51.100.${240 + n}`, scheme);
  const adm = await newPage(`198.51.100.${242 + n}`, scheme);
  await login(at, mail("at"), pw.at);
  await login(adm, mail("adm"), pw.adm);

  // Ajustes: índice de grupos, anclas viejas y nuevas, controles ≥ 44 px
  for (const [who, page] of [
    ["atleta", at],
    ["admin", adm],
  ] as const) {
    await check(page, "/settings", `${who} ${scheme}`);
    const nav = page.getByRole("navigation", { name: "Secciones de Ajustes" });
    const chips = await nav.getByRole("link").count();
    if (chips !== (who === "admin" ? 7 : 6))
      errors.push(`índice de Ajustes (${who}): ${chips} grupos`);
    for (const id of [
      "g-entreno",
      "g-avisos",
      "g-cuenta",
      "entrenadora",
      "mis-reglas",
      "pista",
      "notificaciones",
      "modulos",
      "strava",
      "ia",
      "seguridad",
      "datos",
      "acerca",
    ]) {
      if (!(await page.locator(`#${id}`).count()))
        errors.push(`falta #${id} (${who} ${scheme})`);
    }
    if (who === "atleta" && (await page.locator("#g-admin").count()))
      errors.push("la atleta ve el grupo de administración");
    if (who === "admin" && !(await page.locator("#g-admin").count()))
      errors.push("falta el grupo de administración para ADMIN");
    await nav.getByRole("link", { name: "Cuenta y seguridad" }).tap();
    await page.waitForTimeout(200);
    if (scheme === "light" && who === "atleta")
      await page.screenshot({
        path: `${out}/v23d-01-ajustes.png`,
        fullPage: true,
      });
  }

  for (const url of STATIC) await check(at, url, `atleta ${scheme}`);
  if (scheme === "light") await check(adm, "/admin", `admin ${scheme}`);
  await at.context().close();
  await adm.context().close();
  log(
    `${scheme}: Ajustes por grupos y ${STATIC.length} rutas sin scroll horizontal ni controles < 44 px`,
  );
}

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v23d");
