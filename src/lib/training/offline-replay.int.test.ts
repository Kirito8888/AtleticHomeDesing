// v3.2 · Bloque J (V3-N05): reenviar desde la bandeja sin conexión no duplica sesiones ni series.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: async () => null }));

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("reenvío sin conexión de series de fuerza (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("./service");
  let schema: typeof import("./schemas").createSessionSchema;
  let userId: string;
  let exId: string;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    svc = await import("./service");
    schema = (await import("./schemas")).createSessionSchema;
    const t = Date.now();
    userId = (await prisma.user.create({ data: { email: `oj-${t}@test.dev`, name: "Sin red" } })).id;
    exId = (await prisma.exercise.create({ data: { name: `Ej sin red ${t}`, userId } })).id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.exercise.delete({ where: { id: exId } }).catch(() => undefined);
  });

  const body = (sets: number, extra: Record<string, unknown> = {}) =>
    schema.parse({
      date: "2026-11-24",
      type: "STRENGTH",
      discipline: "STRENGTH",
      status: "COMPLETED",
      title: "Gimnasio sin cobertura",
      strength: { sets: Array.from({ length: sets }, (_, i) => ({ exerciseId: exId, setIndex: i + 1, reps: 5, weightKg: 80 + i })) },
      ...extra,
    });

  it("el mismo clientId enviado dos veces (respuesta perdida + bandeja) crea una sesión con sus series una vez", async () => {
    const clientId = `jtest${Date.now()}`;
    const a = await svc.createTrainingSession(userId, null, body(3, { clientId }));
    const b = await svc.createTrainingSession(userId, null, body(3, { clientId }));
    expect(b.id).toBe(a.id);
    expect(await prisma.trainingSession.count({ where: { userId, clientId } })).toBe(1);
    expect(await prisma.strengthSet.count({ where: { strengthSession: { sessionId: a.id } } })).toBe(3);
  });

  it("dos envíos simultáneos con el mismo clientId (dos pestañas) dejan una sola sesión", async () => {
    const clientId = `jpar${Date.now()}`;
    const [a, b] = await Promise.all([svc.createTrainingSession(userId, null, body(2, { clientId })), svc.createTrainingSession(userId, null, body(2, { clientId }))]);
    expect(b.id).toBe(a.id);
    expect(await prisma.trainingSession.count({ where: { userId, clientId } })).toBe(1);
  });

  it("completar la planificada (PATCH) reenviado deja las mismas series, sin duplicar", async () => {
    const planned = await svc.createTrainingSession(userId, null, schema.parse({ date: "2026-11-25", type: "STRENGTH", discipline: "STRENGTH", status: "PLANNED", strength: { sets: [] } }));
    await svc.updateTrainingSession(userId, planned.id, body(4));
    await svc.updateTrainingSession(userId, planned.id, body(4));
    const s = await prisma.trainingSession.findMany({ where: { userId, OR: [{ id: planned.id }, { date: new Date("2026-11-25") }] }, include: { strength: { include: { sets: true } } } });
    expect(s).toHaveLength(1);
    expect(s[0].id).toBe(planned.id);
    expect(s[0].status).toBe("COMPLETED");
    expect(s[0].strength?.sets).toHaveLength(4);
  });
});
