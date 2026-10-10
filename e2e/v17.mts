// E2E de la v1.7 en un móvil de 390 px (app con ALLOW_REGISTRATION=true y LIFEOS_FAKE_AI=1;
// necesita DATABASE_URL para crear cuentas con `npm run user`).
//   BASE_URL=http://localhost:3000 npm run e2e:v17
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import { chromium } from "playwright-core";

const out = process.env.SHOTS_DIR ?? "e2e/screenshots";
mkdirSync(out, { recursive: true });
const B = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a: unknown[]) => console.log("✔", ...a);
const errors: string[] = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
// IP propia (X-Forwarded-For, como en security.mjs): las suites anteriores agotan los límites por IP
const IP = { "x-forwarded-for": "198.51.100.170" };
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", hasTouch: true, isMobile: true, extraHTTPHeaders: IP });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
page.on("console", (m) => {
  // ERR_INTERNET_DISCONNECTED: el paso «sin conexión» lo provoca a propósito
  if (m.type() === "error" && !/404|422|ERR_INTERNET_DISCONNECTED/.test(m.text())) errors.push(`console ${page.url()}: ${m.text()}`);
});
page.on("response", (r) => {
  if (r.url().includes("/api/") && r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`);
});
const shot = (n: string) => page.screenshot({ path: `${out}/v17-${n}.png`, fullPage: true });
const go = async (u: string) => {
  await page.goto(u, { waitUntil: "load" });
  await page.waitForTimeout(400);
};
const toast = (re: RegExp) => page.getByText(re).first().waitFor({ timeout: 30_000 });
const noOverflow = async (where: string) => {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  if (w > 392) errors.push(`${where}: desborda en horizontal (${w}px)`);
};
const radio = (group: string, name: string | RegExp) => page.getByRole("radiogroup", { name: group }).getByRole("radio", { name, exact: typeof name === "string" });
const madrid = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
const plusDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const api = async (method: "post" | "put" | "patch" | "delete", url: string, data?: unknown) => {
  const r = await page.request[method](B + url, data === undefined ? undefined : { data });
  if (!r.ok()) errors.push(`${method.toUpperCase()} ${url}: ${r.status()} ${(await r.text()).slice(0, 160)}`);
  return r.ok() ? r.json().catch(() => ({})) : {};
};

const user = (...a: string[]) => execFileSync("npm", ["run", "-s", "user", "--", ...a], { encoding: "utf8" });
const newUser = (email: string, role = "ATHLETE") => {
  const pw = user("create", email, "--name", "Amiga", "--role", role).match(/Contraseña: (\S+)/)?.[1];
  if (!pw) throw new Error(`no se pudo crear ${email}`);
  return pw;
};
// v1.8: la administración exige 2FA o una llave de acceso → llave con autenticador virtual
const addPasskey = async (p: import("playwright-core").Page) => {
  const cdp = await p.context().newCDPSession(p);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await p.goto(B + "/settings");
  await p.getByLabel("Nombre de la llave").fill("Llave de administración");
  await p.getByRole("button", { name: "Añadir llave" }).click();
  await p.getByLabel("Mis llaves de acceso").getByText("Llave de administración").waitFor();
};
const login = async (email: string, pw: string) => {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", extraHTTPHeaders: { "x-forwarded-for": "198.51.100.171" } });
  const p = await c.newPage();
  await p.goto(B + "/login");
  await p.fill("#email", email);
  await p.fill("#password", pw);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login")), p.click("button[type=submit]")]);
  return p;
};

// 1. Cuenta (con la herramienta de administración: el registro por formulario ya lo prueban las otras
// suites y el límite de 5 registros por hora e IP se agotaría en la CI)
const myEmail = `v17${Date.now()}@test.dev`;
const myPw = newUser(myEmail);
await go(B + "/login");
await page.fill("#email", myEmail);
await page.fill("#password", myPw);
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);
log("cuenta e inicio de sesión");

// 2. Seguridad v1.7: cabeceras, llave de acceso (autenticador virtual de Chromium) y auditoría encadenada
const head = await page.request.get(B + "/login");
for (const [h, v] of [["cross-origin-resource-policy", "same-origin"], ["x-permitted-cross-domain-policies", "none"]]) {
  if (head.headers()[h] !== v) errors.push(`cabecera ${h}: ${head.headers()[h]}`);
}
if (head.headers()["x-powered-by"]) errors.push("sigue saliendo X-Powered-By");

const cdp = await ctx.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});
await go(B + "/settings");
await page.getByLabel("Nombre de la llave").fill("Móvil de prueba");
await page.getByRole("button", { name: "Añadir llave" }).click();
await toast(/Llave de acceso añadida/);
await page.getByLabel("Mis llaves de acceso").getByText("Móvil de prueba").waitFor();
await page.getByLabel("Integridad del registro").getByText(/Registro íntegro/).waitFor();
await page.getByText("Llave de acceso añadida").last().waitFor();
await noOverflow("/settings");
await shot("01-passkey");

// Salir y entrar con la llave, sin contraseña
await page.context().clearCookies();
await go(B + "/login");
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 }), page.getByRole("button", { name: "Entrar con llave de acceso" }).click()]);
await go(B + "/settings");
await page.getByText("Inicio de sesión con llave de acceso").first().waitFor();
log("llave de acceso: alta, entrar sin contraseña y registro de auditoría íntegro");


// 3. Privacidad: páginas legales públicas, consentimientos y limitación del tratamiento
const anon = await browser.newContext();
for (const path of ["/legal/privacidad", "/legal/aviso"]) {
  const r = await anon.request.get(B + path, { maxRedirects: 0 });
  if (r.status() !== 200) errors.push(`${path} debería ser pública: ${r.status()}`);
}
if (!(await (await anon.request.get(B + "/legal/privacidad")).text()).includes("Política de privacidad")) errors.push("la política de privacidad no se muestra");
await anon.close();
await go(B + "/settings");
await page.getByRole("switch", { name: "Permitir enviar datos a Google Gemini" }).click();
await toast(/Atlenza IA activado/);
await go(B + "/settings/privacy");
await page.getByLabel("Consentimientos").getByText(/Atlenza IA \(Google Gemini\) · concedido/).waitFor();
await page.getByRole("switch", { name: "Limitar el tratamiento de mis datos" }).click();
await toast(/Tratamiento limitado/);
const blocked = await page.request.post(B + "/api/calendar/feed");
if (blocked.status() !== 403) errors.push(`con la limitación activa el enlace .ics debería dar 403 (da ${blocked.status()})`);
await page.getByRole("switch", { name: "Limitar el tratamiento de mis datos" }).click();
await toast(/Limitación levantada/);
await page.getByLabel("Mis peticiones").getByText(/levantada/).waitFor();
await noOverflow("/settings/privacy");
await shot("02-privacy");
log("privacidad: páginas legales, consentimientos con historial y limitación del tratamiento");

// 4. Creador de rutinas con cuestionario y proyección
await go(B + "/training");
await page.getByRole("link", { name: "Crear mi rutina" }).click();
await page.waitForURL(/\/training\/routine$/);
await radio("Soy", "Mujer").click();
await page.getByLabel("Edad").fill("29");
await page.getByLabel("Peso (kg)").fill("62");
await page.getByLabel("Altura (cm)").fill("168");
await radio("Experiencia entrenando", "Nunca he entrenado con regularidad").click();
await radio("Actividad diaria", "Ligera (camino a diario)").click();
await page.getByRole("button", { name: "Siguiente" }).click();
// Salud: con una respuesta marcada no se genera; sin nada, sí
await page.getByRole("button", { name: "No me pasa nada de esto" }).click();
await page.getByRole("button", { name: "Siguiente" }).click();
await page.getByLabel(/Flexiones seguidas/).fill("6");
await page.getByLabel(/Sentadillas en 1 minuto/).fill("24");
await page.getByLabel(/Plancha frontal/).fill("30");
await page.getByRole("button", { name: "Siguiente" }).click();
await radio("Objetivo a corto plazo", "Ganar fuerza").click();
await radio("Objetivo a largo plazo", "Hacer del ejercicio un hábito").click();
await page.getByRole("button", { name: "Siguiente" }).click();
for (const d of ["Lun", "Mié", "Vie"]) await page.getByRole("group", { name: "Días por semana" }).getByRole("checkbox", { name: d }).click();
await radio("Dónde entrenas", "Casa").click();
await page.getByRole("group", { name: "Material que tienes" }).getByRole("checkbox", { name: "Gomas elásticas" }).click();
await page.getByRole("group", { name: "Zonas con molestias" }).getByRole("checkbox", { name: "Rodilla" }).click();
await noOverflow("/training/routine");
await page.getByRole("button", { name: "Crear mi rutina" }).click();
await page.waitForURL(/\/training\/routine\/[a-z0-9]+$/, { timeout: 30_000 });
await page.getByText("Empieza desde cero").first().waitFor();
await page.getByRole("figure", { name: "Proyección: Flexiones seguidas (de rodillas cuentan)" }).waitFor();
await page.getByLabel("Test", { exact: true }).selectOption("pushups");
await page.getByLabel("Resultado").fill("8");
await page.getByRole("button", { name: "Anotar test" }).click();
await toast(/Test anotado/);
await noOverflow("/training/routine/[id]");
await shot("03-routine");
await page.getByRole("link", { name: "Ver y activar la rutina" }).click();
await page.getByText("Rutina del cuestionario").waitFor();
log("creador de rutinas: cuestionario, perfil, rutina en borrador, proyección y retest");

// 5. Entreno y competición: diario técnico, comparador, lanzamientos y récords, simulador, combinadas, calendario
const tech = (n: number, marks: number[], tags: string[]) =>
  api("post", "/api/training/sessions", {
    date: plusDays(madrid, -n),
    type: "TECHNICAL",
    title: `Técnica ${n}`,
    durationSec: 3600,
    sessionRpe: 6,
    tags,
    notes: n === 3 ? "Mejor bloqueo con la pierna izquierda" : null,
    technical: { event: "JAVELIN", implementWeightG: 800, cue: "brazo largo", attempts: marks.map((markM) => ({ markM, isFoul: false, isMeasured: true })) },
  }) as Promise<{ id: string }>;
const t1 = await tech(10, [44.2, 45.1], ["salida"]);
const t2 = await tech(3, [46.3, 47.8, 46.9], ["bloqueo", "viento"]);
await go(B + "/training/diary");
await page.getByRole("navigation", { name: "Etiquetas" }).getByRole("link", { name: /#bloqueo/ }).click();
await page.getByLabel("Entradas del diario").getByText("Mejor bloqueo con la pierna izquierda").waitFor();
await page.getByLabel("Buscar en el diario").fill("pierna izquierda");
await page.getByRole("button", { name: "Buscar" }).click();
await page.getByLabel("Entradas del diario").getByText(/Clave: «brazo largo»/).first().waitFor();
await go(`${B}/training/compare?a=${t1.id}&b=${t2.id}`);
await page.getByRole("table", { name: "Comparación" }).getByText("Mejor marca").waitFor();
await page.getByRole("table", { name: "Comparación" }).getByText("(+2.7)").waitFor();
await go(B + "/training/javelin");
await page.getByRole("table", { name: "Lanzamientos por semana" }).getByText("800 g").waitFor();
await page.getByLabel("Récords por temporada").getByText(/47,80?\s?m/).waitFor();
await noOverflow("/training/javelin");
const compEv = (await api("post", "/api/planning/events", { type: "COMPETITION", title: "Liga E2E", startAt: plusDays(madrid, 9) })) as { id: string };
await go(`${B}/planning/competition/${compEv.id}`);
await page.getByLabel("Tus intentos").getByText("Intento 6").waitFor();
await page.getByLabel("Prueba 1", { exact: true }).fill("100 m vallas");
await page.getByLabel("Hora de la prueba 1").fill("09:00");
await page.getByLabel("Prueba 2", { exact: true }).fill("Altura");
await page.getByLabel("Hora de la prueba 2").fill("09:40");
await page.getByLabel("Calentamientos de las pruebas").getByText(/Hueco de 10 min|Muy poco hueco/).waitFor();
await noOverflow("/planning/competition");
await go(B + "/planning");
await page.getByText("Importar calendario de competiciones (.ics o CSV)").click();
const ics = `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:${plusDays(madrid, 30).replaceAll("-", "")}\r\nSUMMARY:Control federativo E2E\r\nLOCATION:Burgos\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
await page.getByLabel("Calendario de competiciones (.ics o CSV)").setInputFiles({ name: "fed.ics", mimeType: "text/calendar", buffer: Buffer.from(ics) });
await page.getByLabel("Competiciones encontradas").getByText(/Control federativo E2E/).waitFor();
await page.getByRole("button", { name: "Añadir 1 al calendario" }).click();
await toast(/1 competiciones añadidas/);
await shot("04-training");
log("diario técnico, comparador, lanzamientos y récords, simulador, combinadas e importar calendario");

// 5. Salud: sueño, ánimo, escalas, respiración, fotos de lesión, anticoncepción y menopausia, informe anual
await go(B + "/recovery/wellbeing");
await page.getByLabel("Cafeína del día (mg)").fill("200");
await page.getByLabel("Última cafeína").fill("21:00");
await radio("Calidad del sueño", "2").click();
await page.getByRole("button", { name: "Guardar noche" }).click();
await toast(/Noche guardada/);
await page.getByLabel("Últimas noches").getByText(/cafeína/).first().waitFor();
await radio("Ánimo", "2").click();
await radio("Estrés", "4").click();
await page.getByRole("button", { name: "Guardar ánimo de hoy" }).click();
await toast(/Ánimo guardado/);
await page.getByLabel("Tendencia del ánimo").getByText(/7 días: ánimo 2/).waitFor();
await page.getByLabel("Zona", { exact: true }).fill("codo");
await radio("Dolor ahora", "4").click();
await page.getByRole("button", { name: "Guardar escala" }).click();
await page.getByLabel("Escalas guardadas").getByText(/Dolor \(EVA\) codo: 4/).waitFor();
await page.getByRole("button", { name: "Empezar" }).click();
await page.getByText(/Inhala · \d/).waitFor();
await page.getByRole("button", { name: "Parar" }).click();
await noOverflow("/recovery/wellbeing");
await shot("05-wellbeing");

await api("post", "/api/recovery/injuries", { area: "ELBOW", side: "RIGHT", pain: 3, startedOn: madrid });
await go(B + "/recovery");
// PNG de 2×2 sintético: el navegador lo vuelve a codificar a JPEG (sin EXIF) antes de subirlo
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGM4EWAARAwQCgAmTgUhXywv4AAAAABJRU5ErkJggg==", "base64");
await page.getByLabel("Añadir foto de la molestia").setInputFiles({ name: "codo.png", mimeType: "image/png", buffer: png });
await toast(/Foto guardada/);
await page.getByLabel("Fotos de la molestia").getByRole("button").first().click();
await page.getByRole("img", { name: "Foto de la molestia" }).waitFor();
const photoOk = await page.getByRole("img", { name: "Foto de la molestia" }).evaluate((i: HTMLImageElement) => i.decode().then(() => i.naturalWidth > 0));
if (!photoOk) errors.push("la foto descifrada no se ve");
await page.getByRole("button", { name: "Borrar esta foto" }).click();
await page.getByLabel("Fotos de la molestia").waitFor({ state: "detached" });

await api("put", "/api/health/women", { contraception: "PILL_COMBINED", contraceptionSince: plusDays(madrid, -200), menopause: "PERI" });
await go(B + "/recovery/women");
await page.locator("#etapa").getByText("Píldora combinada", { exact: true }).waitFor();
await page.getByLabel("Pautas de la menopausia").waitFor();
await page.getByRole("group", { name: "Síntomas de hoy" }).getByRole("checkbox", { name: "Sofocos" }).click();
await page.getByRole("button", { name: "Guardar síntomas de hoy" }).click();
await toast(/Síntomas guardados/);
await noOverflow("/recovery/women");
const annual = (await api("post", "/api/health/reports", { kind: "ANNUAL" })) as { url?: string };
const anon2 = await browser.newContext();
const rep = await anon2.request.get(annual.url!.replace(/^https?:\/\/[^/]+/, B));
const repHtml = await rep.text();
if (!rep.ok() || !repHtml.includes("Informe anual de salud") || !repHtml.includes("Sofocos")) errors.push(`informe anual: ${rep.status()}`);
await anon2.close();
await shot("06-women");
log("sueño, ánimo, escalas, respiración, fotos cifradas, anticoncepción y menopausia, informe anual");

// 6. Nutrición y estudio: plan semanal → compra, sudoración, suplementos, tarjetas a mano, trabajos y franjas
await api("post", "/api/nutrition/recipes", { name: "Lentejas E2E", servings: 2, items: [{ name: "Lentejas", grams: 200, kcal100: 350, protein100: 24, carbs100: 60, fat100: 1 }] });
await go(B + "/nutrition/plan");
await radio("Comida", "Comida").click();
await page.getByRole("button", { name: "Añadir al plan" }).click();
await toast(/Añadida al plan/);
await page.getByLabel("Plan de la semana").getByText(/Comida: Lentejas E2E/).waitFor();
await page.getByRole("button", { name: "Pasar los ingredientes a la lista de la compra" }).click();
await toast(/1 ingredientes a la lista/);
await noOverflow("/nutrition/plan");
await go(B + "/nutrition/shopping");
await page.getByLabel("Lista de la compra").getByText("Lentejas", { exact: true }).waitFor();
await page.getByText("Escanear en el súper").waitFor();

await go(B + "/nutrition/sweat");
await page.getByLabel("Peso antes (kg)").fill("70");
await page.getByLabel("Peso después (kg)").fill("68,9");
await page.getByLabel("Bebido durante (ml)").fill("500");
await page.getByLabel("Orina durante (ml)").fill("100");
await page.getByRole("button", { name: "Calcular y guardar" }).click();
await page.getByLabel("Pruebas de sudoración").getByText(/1,5 L\/h/).waitFor();
await noOverflow("/nutrition/sweat");

await api("post", "/api/recovery/supplements", { name: "Hierro E2E", startedOn: madrid });
await go(B + "/recovery/health");
await page.getByRole("button", { name: /Días de Hierro E2E/ }).click();
const wd = ["L", "M", "X", "J", "V", "S", "D"][(new Date(`${madrid}T12:00:00Z`).getUTCDay() + 6) % 7];
await page.getByRole("group", { name: "Días de Hierro E2E" }).getByRole("button", { name: wd, exact: true }).click();
await page.getByRole("checkbox", { name: new RegExp(`^Hierro E2E `) }).first().click();
await page.getByText(/Cumplimiento de la semana: 100 %/).waitFor();
await noOverflow("/recovery/health");

await go(B + "/study");
await page.getByRole("tab", { name: "Flashcards" }).click();
await page.getByLabel("Mazo").fill("Biología E2E");
await page.getByLabel("Tarjetas", { exact: true }).fill("ADN | Ácido desoxirribonucleico\nATP | Adenosín trifosfato");
await page.getByRole("button", { name: "Añadir tarjetas" }).click();
await toast(/2 tarjetas añadidas/);
await go(B + "/study/assignments");
await page.getByLabel("Asignatura").fill("Física");
await page.getByLabel("Trabajo", { exact: true }).fill("Práctica de péndulo");
await page.getByLabel("Entrega").fill(plusDays(madrid, 2));
await page.getByRole("button", { name: "Añadir trabajo" }).click();
await page.getByLabel("Trabajos pendientes").getByText(/En 2 d y sin empezar/).waitFor();
await radio("Estado de Práctica de péndulo", "Entregado").click();
await page.getByLabel("Nota de Práctica de péndulo").fill("8,5");
await page.getByRole("button", { name: "Guardar nota" }).click();
await page.getByLabel("Media por asignatura").getByText(/8,5/).waitFor();
await noOverflow("/study/assignments");
await api("post", "/api/study/sessions", { subject: "Física", minutes: 25, date: madrid });
await go(B + "/study/focus");
await page.getByLabel("Estudio por franja").waitFor();
await shot("07-nutrition-study");
log("plan de comidas y compra, sudoración, calendario de suplementos, tarjetas a mano, trabajos y franjas de estudio");

// 7. Finanzas y plataforma: presupuesto de temporada, justificante cifrado, subida de precio, sin conexión,
// «De un vistazo» y cuentas demo
const accs = (await (await page.request.get(B + "/api/finance/accounts")).json()) as Array<{ id: string; type: string }>;
let bank = accs.find((a) => a.type === "ASSET");
bank ??= (await api("post", "/api/finance/accounts", { name: "Banco E2E", type: "ASSET" })) as { id: string; type: string };
await api("post", "/api/finance/transactions", { mode: "simple", kind: "EXPENSE", date: madrid, description: "Clavos de jabalina", amountCents: 4500, moneyAccountId: bank.id, sport: true });
await api("post", "/api/finance/subscriptions", { name: "Música E2E", amountCents: 999, nextChargeDate: plusDays(madrid, 20), accountId: bank.id });
await api("post", "/api/finance/transactions", { mode: "simple", kind: "EXPENSE", date: madrid, description: "PAGO MUSICA E2E", amountCents: 1199, moneyAccountId: bank.id });
await go(B + "/finance");
await page.getByLabel("Material (€)").fill("300");
await page.getByLabel("Coste medio por competición (€)").fill("50");
await page.getByRole("button", { name: /^Guardar presupuesto \d{4}$/ }).click();
await toast(/Presupuesto guardado/);
await page.getByLabel("Previsión de la temporada").getByText(/Previsión a 31 de diciembre/).waitFor();
await page.getByLabel("Subidas de precio").getByText(/Música E2E/).waitFor();
await page.getByRole("button", { name: /Actualizar a 11,99/ }).click();
await toast(/Importe actualizado/);
await page.getByRole("button", { name: "Entendido" }).waitFor();
await page.getByLabel("Adjuntar justificante").first().setInputFiles({ name: "ticket.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% sintético\n") });
await toast(/Justificante guardado/);
await page.getByRole("link", { name: "Justificante 1" }).first().waitFor();
await noOverflow("/finance");

await go(B + "/nutrition");
await ctx.setOffline(true);
await page.getByRole("button", { name: "+250 ml" }).click();
await toast(/Sin conexión: el agua se apuntará/);
await ctx.setOffline(false);
await page.evaluate(() => window.dispatchEvent(new Event("online")));
await toast(/sin conexión ya enviados/);

await go(B + "/glance");
await page.getByLabel("Resumen del día").getByText(/0,25 L/).waitFor();
await noOverflow("/glance");
await shot("08-finance-glance");

const adminEmail = `v17admin${Date.now()}@test.dev`;
const admin = await login(adminEmail, newUser(adminEmail, "ADMIN"));
await addPasskey(admin);
await admin.goto(B + "/settings");
await admin.getByRole("radiogroup", { name: "Tipo de público" }).getByRole("radio", { name: "Lanzador" }).click();
await admin.getByRole("button", { name: "Crear cuenta demo" }).click();
const demoBox = admin.getByRole("status").filter({ hasText: "Contraseña" });
await demoBox.waitFor({ timeout: 60_000 });
const demoEmail = (await demoBox.locator(".font-mono").first().textContent())!.trim();
const demoPw = (await admin.getByLabel("Contraseña de la cuenta demo").textContent())!.trim();
await admin.getByLabel("Cuentas demo").getByText(/Lanzador/).waitFor();
const demoPage = await login(demoEmail, demoPw);
await demoPage.getByText(/Cuenta de demostración/).waitFor();
await demoPage.goto(B + "/training");
if (!(await demoPage.getByText(/Técnica de jabalina|Fuerza máxima|Potencia y pliometría/).count())) errors.push("demo: no hay sesiones sintéticas");
await demoPage.context().close();
await admin.context().close();
log("presupuesto de temporada, justificante cifrado, subida de precio, agua sin conexión, de un vistazo y cuenta demo");

await browser.close();
if (errors.length) {
  console.error("✘ errores:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK v17");
