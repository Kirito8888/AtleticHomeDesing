// E2E del Bloque J de v3.2 (V3-N05, «entreno sin red») en un móvil de 390 px (build de producción y DATABASE_URL).
//   BASE_URL=http://localhost:3000 npm run e2e:sinred
// 1) series de fuerza anotadas sin red sobreviven a cerrar la pestaña (borrador local) · 2) se encolan y se envían
// al volver la red · 3) respuesta perdida + bandeja = una sola sesión · 4) completar la planificada sin red (PATCH)
// 5) lo de otra cuenta no se envía · 6) «Salir» avisa y borra lo pendiente.
import { execFileSync } from "node:child_process";

import { chromium, type Page } from "playwright-core";

import { a11y } from "./a11y.mjs";

const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.181" } });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
const noOverflow = async (where: string) => {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  if (w > 392) errors.push(`${where}: desborda en horizontal (${w}px)`);
};
const minH = async (loc: ReturnType<typeof page.locator>, what: string) => {
  const h = (await loc.boundingBox())?.height ?? 0;
  if (h < 44) errors.push(`${what} mide ${h}px (< 44)`);
};
const online = async () => {
  await ctx.setOffline(false);
  await page.waitForFunction(async () => (await fetch("/api/health", { cache: "no-store" }).catch(() => null))?.ok === true, null, { timeout: 10000, polling: 250 });
};
/** Sesiones de la cuenta con ese título y sus series. */
const sessionsTitled = async (title: string) => {
  const list = (await (await page.request.get(B + "/api/training/sessions?limit=200")).json()) as Array<{ id: string; title: string | null; status: string; strength: { _count: { sets: number } } | null }>;
  return list.filter((s) => s.title === title);
};
const outboxRaw = (p: Page) =>
  p.evaluate(
    () =>
      new Promise<Array<{ id: string; owner?: string }>>((resolve) => {
        const req = indexedDB.open("lifeos-outbox", 2);
        req.onupgradeneeded = () => {
          req.result.createObjectStore("items", { keyPath: "id" });
          req.result.createObjectStore("drafts", { keyPath: "key" });
        };
        req.onsuccess = () => {
          const r = req.result.transaction("items", "readonly").objectStore("items").getAll();
          r.onsuccess = () => resolve(r.result as Array<{ id: string; owner?: string }>);
          r.onerror = () => resolve([]);
        };
        req.onerror = () => resolve([]);
      }),
  );
const addSquat = async (repeats: number) => {
  await page.getByLabel("Buscar ejercicio").fill("sentadilla tr");
  await page.getByRole("button", { name: /Sentadilla trasera/ }).first().click();
  for (let i = 0; i < repeats; i++) await page.getByRole("button", { name: "Repetir serie" }).last().click();
};

const email = `sinred${Date.now()}@test.dev`;
const out1 = execFileSync("npm", ["run", "-s", "user", "--", "create", email, "--name", "Gimnasio", "--role", "ATHLETE", "--accept-terms"], { encoding: "utf8" });
const pw = out1.match(/Contraseña: (\S+)/)?.[1];
if (!pw) throw new Error("no se pudo crear la cuenta");
const login = async () => {
  await page.goto(B + "/login");
  await page.fill("#email", email);
  await page.fill("#password", pw);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);
};
await login();

// 1 · Series sin red que sobreviven a cerrar la pestaña
const t1 = `Sin red ${Date.now()}`;
await page.goto(B + "/training/new");
await page.waitForLoadState("networkidle");
await ctx.setOffline(true);
await page.fill("#title", t1);
await addSquat(2); // 3 series
await page.waitForTimeout(800); // el borrador se guarda a los 300 ms del último cambio
await online();
await page.reload(); // el móvil cerró la pestaña
await page.waitForLoadState("networkidle");
const restore = page.getByTestId("draft-restore");
await restore.waitFor({ timeout: 8000 }).catch(() => errors.push("no se ofrece recuperar el registro sin terminar"));
if (!/3 serie/.test(await restore.innerText().catch(() => ""))) errors.push(`el aviso no cuenta 3 series: «${await restore.innerText().catch(() => "")}»`);
await minH(restore.getByRole("button", { name: "Recuperar" }), "«Recuperar»");
await minH(restore.getByRole("button", { name: "Descartar" }), "«Descartar»");
await noOverflow("aviso de borrador");
errors.push(...(await a11y(page, "nueva sesión con borrador")));
await restore.getByRole("button", { name: "Recuperar" }).click();
if ((await page.inputValue("#title")) !== t1) errors.push("el título no se ha recuperado");
if (!(await page.getByRole("button", { name: "Borrar serie 3" }).count())) errors.push("no se han recuperado las 3 series");
log("borrador: 3 series recuperadas tras recargar");

// 2 · Guardar sin red → bandeja → se envía sola al volver la red, una vez
await ctx.setOffline(true);
await page.getByRole("button", { name: "Guardar sesión" }).click();
await page.getByTestId("session-queued").waitFor({ timeout: 5000 }).catch(() => errors.push("sin red: no dice que queda guardada en el móvil"));
const pend = page.getByTestId("outbox-pending");
await pend.waitFor({ timeout: 5000 }).catch(() => errors.push("sin red: no sale el aviso de pendientes"));
await minH(pend.getByRole("button", { name: "Enviar ahora" }), "«Enviar ahora»");
await noOverflow("pendientes");
await page.getByRole("button", { name: "Guardar sesión" }).click(); // un segundo toque no duplica (mismo clientId)
await page.waitForTimeout(300);
if ((await outboxRaw(page)).length !== 1) errors.push(`la bandeja tiene ${(await outboxRaw(page)).length} elementos (se esperaba 1)`);
await online();
await pend.waitFor({ state: "detached", timeout: 15000 }).catch(() => errors.push("al volver la red no se envía lo pendiente"));
const s1 = await sessionsTitled(t1);
if (s1.length !== 1) errors.push(`sesión sin red: ${s1.length} sesiones (se esperaba 1)`);
else if (s1[0].strength?._count.sets !== 3) errors.push(`sesión sin red: ${s1[0].strength?._count.sets} series (se esperaban 3)`);
log("bandeja: enviada al volver la red, una sesión con 3 series");

// 3 · Respuesta perdida (el servidor guarda, el móvil no se entera) + bandeja = una sola sesión
const t2 = `Respuesta perdida ${Date.now()}`;
await page.goto(B + "/training/new");
await page.waitForLoadState("networkidle");
if (await page.getByTestId("draft-restore").count()) errors.push("tras enviar, sigue ofreciéndose el borrador");
await page.fill("#title", t2);
await addSquat(1);
let cut = false;
await page.route("**/api/training/sessions", async (route) => {
  if (route.request().method() === "POST" && !cut) {
    cut = true;
    await route.fetch(); // llega al servidor y se guarda
    return route.abort("internetdisconnected");
  }
  return route.continue();
});
await page.getByRole("button", { name: "Guardar sesión" }).click();
await page.getByTestId("session-queued").waitFor({ timeout: 8000 }).catch(() => errors.push("respuesta perdida: no se encola"));
await page.unrouteAll({ behavior: "ignoreErrors" });
await page.getByTestId("outbox-pending").getByRole("button", { name: "Enviar ahora" }).click().catch(() => undefined);
await page.getByTestId("outbox-pending").waitFor({ state: "detached", timeout: 15000 }).catch(() => errors.push("respuesta perdida: no se vacía la bandeja"));
const s2 = await sessionsTitled(t2);
if (s2.length !== 1) errors.push(`respuesta perdida: ${s2.length} sesiones (se esperaba 1, sin duplicados)`);
log("respuesta perdida: una sola sesión");

// 4 · Completar sin red la sesión planificada (PATCH en la bandeja)
const t3 = `Planificada ${Date.now()}`;
const madridDay = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
const planned = (await (await page.request.post(B + "/api/training/sessions", { data: { date: madridDay, type: "STRENGTH", status: "PLANNED", title: t3, strength: { sets: [] } } })).json()) as { id: string };
await page.goto(`${B}/training/${planned.id}/edit`);
await page.waitForLoadState("networkidle");
await ctx.setOffline(true);
await addSquat(1); // la precarga de la sesión anterior queda sin marcar; «Repetir» añade una hecha
await page.getByRole("button", { name: "Guardar cambios" }).click();
await page.getByTestId("session-queued").waitFor({ timeout: 5000 }).catch(() => errors.push("PATCH sin red: no se encola"));
await online();
await page.getByTestId("outbox-pending").waitFor({ state: "detached", timeout: 15000 }).catch(() => errors.push("PATCH sin red: no se envía al volver"));
const s3 = await sessionsTitled(t3);
if (s3.length !== 1 || s3[0].id !== planned.id) errors.push(`PATCH sin red: ${s3.length} sesiones con ese título`);
else if (!s3[0].strength?._count.sets) errors.push("PATCH sin red: la sesión sigue sin series");
log("planificada completada sin red: mismas series, misma sesión");

// 4b · Tomas y agua: respuesta perdida + bandeja = una sola (clave idempotente, v3.2 J)
const waterMl = async () => ((await (await page.request.get(`${B}/api/nutrition/water?date=${madridDay}`)).json()) as { ml: number }).ml;
const mealsNamed = async (name: string) => {
  const d = (await (await page.request.get(`${B}/api/nutrition/entries?date=${madridDay}`)).json()) as { entries: Array<{ customName: string | null }> };
  return d.entries.filter((e) => e.customName === name).length;
};
await page.goto(B + "/nutrition");
await page.waitForLoadState("networkidle");
const ml0 = await waterMl();
let cutWater = false;
await page.route("**/api/nutrition/water", async (route) => {
  if (route.request().method() === "POST" && !cutWater) {
    cutWater = true;
    await route.fetch(); // llega al servidor y se guarda
    return route.abort("internetdisconnected");
  }
  return route.continue();
});
await page.getByRole("button", { name: "+250 ml" }).first().click();
await page.getByTestId("outbox-pending").waitFor({ timeout: 8000 }).catch(() => errors.push("agua perdida: no se encola"));
await page.unrouteAll({ behavior: "ignoreErrors" });
await page.getByTestId("outbox-pending").getByRole("button", { name: "Enviar ahora" }).click().catch(() => undefined);
await page.getByTestId("outbox-pending").waitFor({ state: "detached", timeout: 15000 }).catch(() => errors.push("agua perdida: no se vacía la bandeja"));
const ml1 = await waterMl();
if (ml1 - ml0 !== 250) errors.push(`agua perdida: suma ${ml1 - ml0} ml (se esperaban 250, sin duplicar)`);
log("agua: respuesta perdida, una sola anotación");

// Toma de comida: el mismo cuerpo con la misma clave llega dos veces (primer envío + bandeja)
const mealName = `Toma sin red ${Date.now()}`;
const meal = { date: madridDay, mealType: "LUNCH", customName: mealName, quantityG: 100, kcal: 100, proteinG: 5, carbsG: 10, fatG: 2, clientKey: `e2e-${Date.now()}` };
for (let i = 0; i < 2; i++) {
  const r = await page.request.post(B + "/api/nutrition/entries", { data: meal });
  if (!r.ok()) errors.push(`toma: reenvío ${i + 1} → ${r.status()}`);
}
if ((await mealsNamed(mealName)) !== 1) errors.push(`toma: ${await mealsNamed(mealName)} entradas con la misma clave (se esperaba 1)`);
log("toma: la misma clave no duplica");

// Una toma de otra cuenta en la bandeja no se envía con esta sesión
const alienName = `Toma ajena ${Date.now()}`;
await page.evaluate(
  ([name, day]) =>
    new Promise<void>((resolve) => {
      const req = indexedDB.open("lifeos-outbox", 2);
      req.onsuccess = () => {
        const tx = req.result.transaction("items", "readwrite");
        tx.objectStore("items").put({ id: "ajena-toma", url: "/api/nutrition/entries", method: "POST", owner: "otra-cuenta", label: name, createdAt: Date.now(), body: { date: day, mealType: "LUNCH", customName: name, quantityG: 100, kcal: 100, proteinG: 5, carbsG: 10, fatG: 2, clientKey: "ajena-toma" } });
        tx.oncomplete = () => resolve();
      };
    }),
  [alienName, madridDay] as const,
);
await page.reload();
await page.waitForLoadState("networkidle");
await page.waitForTimeout(1500);
if ((await mealsNamed(alienName)) !== 0) errors.push("se ha enviado una toma de otra cuenta con esta sesión");
log("toma de otra cuenta: no se envía");

// 5 · Lo que otra cuenta dejó en este móvil no se envía con esta sesión (y se borra)
const t4 = `Ajena ${Date.now()}`;
await page.goto(B + "/training");
await page.waitForLoadState("networkidle");
await page.evaluate(
  ([title, day]) =>
    new Promise<void>((resolve) => {
      const req = indexedDB.open("lifeos-outbox", 2);
      req.onsuccess = () => {
        const tx = req.result.transaction("items", "readwrite");
        tx.objectStore("items").put({ id: "ajena1234", url: "/api/training/sessions", method: "POST", owner: "otra-cuenta", label: title, createdAt: Date.now(), body: { date: day, type: "STRENGTH", status: "PLANNED", title, strength: { sets: [] }, clientId: "ajena1234" } });
        tx.oncomplete = () => resolve();
      };
    }),
  [t4, madridDay] as const,
);
await page.reload();
await page.waitForLoadState("networkidle");
await page.waitForFunction(
  () =>
    new Promise<boolean>((resolve) => {
      const req = indexedDB.open("lifeos-outbox", 2);
      req.onsuccess = () => {
        const r = req.result.transaction("items", "readonly").objectStore("items").count();
        r.onsuccess = () => resolve(r.result === 0);
      };
    }),
  null,
  { timeout: 8000, polling: 300 },
).catch(() => errors.push("lo de otra cuenta sigue en la bandeja"));
if ((await sessionsTitled(t4)).length) errors.push("se ha enviado lo de otra cuenta con esta sesión");
log("bandeja de otra cuenta: ni se envía ni se queda");

// 6 · «Salir» con algo pendiente: avisa y lo borra del móvil
await page.goto(B + "/training/new");
await page.waitForLoadState("networkidle");
await page.fill("#title", `Pendiente al salir ${Date.now()}`);
await addSquat(1);
await page.route("**/api/training/sessions", (route) => (route.request().method() === "POST" ? route.abort("internetdisconnected") : route.continue()));
await page.getByRole("button", { name: "Guardar sesión" }).click();
await page.getByTestId("outbox-pending").waitFor({ timeout: 8000 }).catch(() => errors.push("salir: no quedó nada pendiente"));
await page.getByRole("button", { name: "Más secciones" }).tap();
await page.getByRole("button", { name: "Salir" }).last().tap();
const dlg = page.getByRole("alertdialog").or(page.getByRole("dialog")).filter({ hasText: "sin enviar" });
await dlg.waitFor({ timeout: 5000 }).catch(() => errors.push("salir: no avisa de lo pendiente"));
await dlg.getByRole("button", { name: "Salir y borrarlos" }).click().catch(() => undefined);
await page.waitForURL((u) => u.pathname.startsWith("/login"), { timeout: 15000 }).catch(() => errors.push("salir: no llega a /login"));
await page.unrouteAll({ behavior: "ignoreErrors" });
if ((await outboxRaw(page)).length) errors.push("salir: la bandeja sigue con datos en el móvil");
log("salir: aviso y bandeja vacía");

await browser.close();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("OK sinred");
