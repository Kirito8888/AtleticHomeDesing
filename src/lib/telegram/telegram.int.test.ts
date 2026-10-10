// Integración (v1.10): Telegram por usuario con BD real y la API del bot simulada.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: async () => null }));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const TOKEN = "123456:TEST-token-abcdefghijklmnopqrstuvw";

describe.skipIf(!HAS_DB)("Telegram por usuario (BD real, bot simulado)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let link: typeof import("./link");
  let push: typeof import("@/lib/push/service");
  let userId: string;
  const t = Date.now();
  const sent: Array<{ chat_id: string; text: string }> = [];
  let updates: unknown[] = [];

  const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    expect(u.startsWith(`https://tg.test/bot${TOKEN}/`)).toBe(true);
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (u.endsWith("/sendMessage")) sent.push(body);
    const result = u.endsWith("/getUpdates") ? updates.splice(0) : u.endsWith("/getMe") ? { username: "atlenza_test_bot" } : { message_id: 1 };
    return new Response(JSON.stringify({ ok: true, result }), { status: 200 });
  }) as typeof fetch;

  beforeAll(async () => {
    process.env.TELEGRAM_BOT_TOKEN = TOKEN;
    process.env.TELEGRAM_API_URL = "https://tg.test";
    vi.stubGlobal("fetch", fakeFetch);
    vi.resetModules();
    prisma = (await import("@/lib/prisma")).prisma;
    link = await import("./link");
    push = await import("@/lib/push/service");
    userId = (await prisma.user.create({ data: { email: `tg-${t}@test.dev` } })).id;
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { contains: `-${t}@test.dev` } } });
    vi.unstubAllGlobals();
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_API_URL;
  });

  it("vincula con /start CÓDIGO (un solo uso) y solo guarda el hash del código", async () => {
    const c = await link.createLinkCode(userId);
    expect(c.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(c.url).toBe(`https://t.me/atlenza_test_bot?start=${c.code}`);
    expect(await prisma.telegramLinkCode.count({ where: { codeHash: c.code } })).toBe(0);
    updates = [{ update_id: 10, message: { chat: { id: 777, type: "private" }, text: `/start ${c.code.toLowerCase()}` } }];
    expect(await link.pollTelegram()).toBe(1);
    expect(await prisma.telegramLink.findUnique({ where: { userId } })).toMatchObject({ chatId: "777", enabled: true });
    expect(sent.at(-1)?.text).toMatch(/Listo/);
    // Reutilizar el código no vale
    expect(await link.handleUpdate({ update_id: 11, message: { chat: { id: 888, type: "private" }, text: `/start ${c.code}` } }, async () => true)).toMatch(/no vale/);
    // Los grupos se ignoran
    expect(await link.handleUpdate({ update_id: 12, message: { chat: { id: -5, type: "group" }, text: "/stop" } }, async () => true)).toBeNull();
  });

  it("sendToUser manda también por Telegram, sin detalles de salud y respetando las horas de silencio", async () => {
    sent.length = 0;
    const r = await push.sendToUser(userId, { title: "Sesión mañana", body: "Fuerza a las 18:00", tag: "tomorrow" });
    expect(r.telegram).toBe(true);
    expect(sent.at(-1)).toMatchObject({ chat_id: "777", text: "Sesión mañana\nFuerza a las 18:00" });
    await push.sendToUser(userId, { title: "Tu regla", body: "Se espera en 2 días", tag: "period" });
    expect(sent.at(-1)?.text).toBe("Atlenza: tienes un aviso nuevo. Ábrelo en la app.");
    expect(JSON.stringify(sent)).not.toContain("regla");
    // Horas de silencio todo el día: no sale nada salvo lo urgente
    await prisma.athleteProfile.upsert({ where: { userId }, create: { userId, prefs: { quietHours: { from: "00:00", to: "23:59" } } }, update: { prefs: { quietHours: { from: "00:00", to: "23:59" } } } });
    sent.length = 0;
    await push.sendToUser(userId, { title: "Resumen", body: "x", tag: "digest" });
    expect(sent).toHaveLength(0);
    await push.sendToUser(userId, { title: "Aviso de seguridad", body: "Nuevo inicio de sesión", tag: "login" });
    expect(sent).toHaveLength(1);
  });

  it("pausar y /stop: deja de enviar y desvincula", async () => {
    await prisma.athleteProfile.update({ where: { userId }, data: { prefs: {} } });
    await link.setTelegramEnabled(userId, false);
    sent.length = 0;
    expect((await push.sendToUser(userId, { title: "x", body: "y", tag: "digest" })).telegram).toBe(false);
    await link.setTelegramEnabled(userId, true);
    expect(await link.handleUpdate({ update_id: 13, message: { chat: { id: 777, type: "private" }, text: "/stop" } }, async () => true)).toMatch(/ya no recibe/);
    expect(await prisma.telegramLink.findUnique({ where: { userId } })).toBeNull();
  });
});
