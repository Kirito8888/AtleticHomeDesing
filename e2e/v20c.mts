// E2E de la v2.0 bloque C (flashcards compartidas, solo lectura, SM-2 por persona) en un móvil de 390 px.
//   BASE_URL=http://localhost:3000 npm run e2e:v20c
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import { chromium, type Page } from "playwright-core";

import { a11y } from "./a11y.mjs";

const out = process.env.SHOTS_DIR ?? "e2e/screenshots";
mkdirSync(out, { recursive: true });
const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let ipSeq = 140;
const newPage = async () => {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": `198.51.100.${ipSeq++}` } });
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(`pageerror ${p.url()}: ${e.message}`));
  p.on("console", (m) => {
    if (m.type() === "error" && !/40[0134]|422/.test(m.text())) errors.push(`console ${p.url()}: ${m.text()}`);
  });
  p.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`);
  });
  return p;
};
const go = async (p: Page, u: string) => {
  await p.goto(B + u, { waitUntil: "load" });
  await p.waitForTimeout(300);
};
const noHScroll = async (p: Page, where: string) => {
  if (await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) errors.push(`scroll horizontal en ${where}`);
};
const call = (p: Page, method: string, url: string, body?: unknown) =>
  p.evaluate(
    async ([m, u, b]) => {
      const r = await fetch(u as string, { method: m as string, headers: { "content-type": "application/json" }, body: b ? JSON.stringify(b) : undefined });
      return { status: r.status, json: await r.json().catch(() => null) };
    },
    [method, url, body] as const,
  );

const user = (...a: string[]) => execFileSync("npm", ["run", "-s", "user", "--", ...a], { encoding: "utf8" });
const newUser = (email: string, name: string, role: string) => {
  const pw = user("create", email, "--name", name, "--role", role, "--accept-terms").match(/Contraseña: (\S+)/)?.[1];
  if (!pw) throw new Error(`no se pudo crear ${email}`);
  return pw;
};
const login = async (p: Page, email: string, pw: string) => {
  await go(p, "/login");
  await p.fill("#email", email);
  await p.fill("#password", pw);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login")), p.click("button[type=submit]")]);
};

const run = Date.now();
const mail = (k: string) => `${k}-${run}@e2e.test`;
const pw = { own: newUser(mail("own"), "Dueña E2E", "ATHLETE"), inv: newUser(mail("inv"), "Invitada E2E", "ATHLETE") };

const own = await newPage();
await login(own, mail("own"), pw.own);
const deckName = `Anatomía ${run}`;
const created = await call(own, "POST", "/api/study/cards", { deck: deckName, lines: "Fémur | Hueso del muslo\nTibia | Hueso de la pierna\nHúmero | Hueso del brazo" });
const deckId = (created.json as { deckId: string }).deckId;
const cardList = async (p: Page) => (await call(p, "GET", `/api/ai/flashcards/due?deckId=${deckId}&limit=50`)).json as Array<{ id: string }>;
const ownerCards = await cardList(own);
if (ownerCards.length !== 3) errors.push(`la dueña debería tener 3 tarjetas, tiene ${ownerCards.length}`);

// 1. La dueña comparte por la UI (y un email inexistente da el mismo error genérico)
await go(own, "/study?tab=cards");
await own.getByRole("button", { name: "Compartir" }).first().click();
await own.getByLabel("Email de la persona").fill(`no-existe-${run}@e2e.test`);
await own.getByRole("button", { name: "Compartir", exact: true }).last().click();
await own.getByText("No se pudo compartir el mazo").first().waitFor();
await own.getByLabel("Email de la persona").fill(mail("inv"));
await own.getByRole("button", { name: "Compartir", exact: true }).last().click();
await own.getByText("Invitada E2E").waitFor();
await own.screenshot({ path: `${out}/v20c-01-compartir.png`, fullPage: true });
log("la dueña comparte el mazo en solo lectura");

// 2. La invitada, a 390 px: lo ve como compartido y repasa todo el mazo
const inv = await newPage();
await login(inv, mail("inv"), pw.inv);
await go(inv, "/study?tab=cards");
await inv.getByRole("heading", { name: "Compartidos conmigo" }).waitFor();
await inv.getByText(/solo lectura/).first().waitFor();
await noHScroll(inv, "flashcards compartidas 390 px");
await inv.screenshot({ path: `${out}/v20c-02-invitada.png`, fullPage: true });
await inv.getByRole("button", { name: "Repasar" }).click();
for (let i = 0; i < 3; i++) {
  await inv.getByRole("button", { name: /Pregunta/ }).click();
  await inv.getByRole("button", { name: i === 0 ? "Fácil" : "Bien" }).click();
}
await inv.getByText("¡Mazo al día!").waitFor();
await noHScroll(inv, "repaso invitada 390 px");
errors.push(...(await a11y(inv, "/study?tab=cards")));
await inv.screenshot({ path: `${out}/v20c-03-repasado.png`, fullPage: true });
log("la invitada completa una sesión de repaso");

// 3. Progreso independiente: a la invitada ya no le toca nada; a la dueña le tocan las 3
if ((await cardList(inv)).length !== 0) errors.push("a la invitada aún le tocan tarjetas");
if ((await cardList(own)).length !== 3) errors.push("el repaso de la invitada cambió lo que le toca a la dueña");
const decksOwn = (await call(own, "GET", "/api/ai/flashcards/decks")).json as Array<{ id: string; reviewed: number; due: number; total: number }>;
const mineOwn = decksOwn.find((d) => d.id === deckId);
if (!mineOwn || mineOwn.reviewed !== 0 || mineOwn.due !== 3 || mineOwn.total !== 3) errors.push(`progreso de la dueña alterado: ${JSON.stringify(mineOwn)}`);
const decksInv = (await call(inv, "GET", "/api/ai/flashcards/decks")).json as Array<{ id: string; reviewed: number; shared: boolean }>;
if (decksInv.find((d) => d.id === deckId)?.reviewed !== 3) errors.push("la invitada no tiene su progreso registrado");
log("progreso personal independiente");

// 4. Solo lectura: la invitada no puede editar ni borrar; el mazo queda intacto
const cid = ownerCards[0].id;
for (const [m, u, b] of [["PATCH", `/api/ai/flashcards/${cid}`, { front: "Hackeada" }], ["DELETE", `/api/ai/flashcards/${cid}`], ["DELETE", `/api/ai/flashcards/decks/${deckId}`], ["POST", `/api/ai/flashcards/decks/${deckId}/shares`, { email: mail("own") }]] as const) {
  const r = await call(inv, m, u, b);
  if (r.status !== 403) errors.push(`${m} ${u} como invitada → ${r.status} (esperaba 403)`);
}
if ((await cardList(own)).length !== 3) errors.push("la invitada alteró el mazo");
if (await inv.getByRole("button", { name: /Compartir/ }).count()) errors.push("la invitada ve el botón Compartir");
log("la invitada no puede editar ni borrar (403)");

// 5. La dueña quita el acceso: el mazo desaparece de la invitada
const sh = (await call(own, "GET", `/api/ai/flashcards/decks/${deckId}/shares`)).json as Array<{ userId: string }>;
await call(own, "DELETE", `/api/ai/flashcards/decks/${deckId}/shares?userId=${sh[0].userId}`);
const after = (await call(inv, "GET", "/api/ai/flashcards/decks")).json as Array<{ id: string }>;
if (after.some((d) => d.id === deckId)) errors.push("la invitada sigue viendo el mazo tras quitarle el acceso");
log("acceso retirado");

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v20c");
