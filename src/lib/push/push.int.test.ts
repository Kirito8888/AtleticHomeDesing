// Integración con BD real del servicio de push (sin red: el envío se simula).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("notificaciones push (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let push: typeof import("@/lib/push/service");
  let userId: string;

  beforeAll(async () => {
    // Claves VAPID de prueba para que el servicio se considere configurado
    const { generateVapidKeys } = await import("@/lib/push/send");
    const k = generateVapidKeys();
    vi.stubEnv("VAPID_PUBLIC_KEY", k.publicKey);
    vi.stubEnv("VAPID_PRIVATE_KEY", k.privateKey);
    vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.com");
    prisma = (await import("@/lib/prisma")).prisma;
    push = await import("@/lib/push/service");
    userId = (await prisma.user.create({ data: { email: `push-${Date.now()}@test.dev` } })).id;
  });

  afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } });
    vi.unstubAllEnvs();
  });

  const sub = (n: number) => ({ endpoint: `https://push.example.test/${Date.now()}-${n}`, keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) } });

  it("envía a todos los dispositivos y borra los que el servicio da por muertos (410)", async () => {
    const alive = sub(1);
    const dead = sub(2);
    await push.saveSubscription(userId, alive);
    await push.saveSubscription(userId, dead);
    const seen: string[] = [];
    const r = await push.sendToUser(userId, { title: "t", body: "b" }, async (t) => {
      seen.push(t.endpoint);
      return t.endpoint === dead.endpoint ? { ok: false, gone: true, status: 410 } : { ok: true };
    });
    expect(r).toEqual({ sent: 1, removed: 1 });
    expect(seen.sort()).toEqual([alive.endpoint, dead.endpoint].sort());
    const left = await prisma.pushSubscription.findMany({ where: { userId } });
    expect(left.map((s) => s.endpoint)).toEqual([alive.endpoint]);
    expect(left[0].lastSuccessAt).not.toBeNull();
  });

  it("notifyOnce no repite la misma notificación", async () => {
    let calls = 0;
    const send = async () => ((calls += 1), { ok: true as const });
    expect(await push.notifyOnce(userId, "digest:2026-10-06", { title: "a", body: "b" }, send)).toBe(true);
    expect(await push.notifyOnce(userId, "digest:2026-10-06", { title: "a", body: "b" }, send)).toBe(false);
    expect(calls).toBe(1);
  });

  it("un error de envío no rompe nada ni borra la suscripción", async () => {
    const r = await push.sendToUser(userId, { title: "t", body: "b" }, async () => ({ ok: false, gone: false, status: 500 }));
    expect(r).toEqual({ sent: 0, removed: 0 });
    expect(await prisma.pushSubscription.count({ where: { userId } })).toBe(1);
  });
});
