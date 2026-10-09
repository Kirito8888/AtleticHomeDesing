// Integración con BD real: comentarios del coach (permisos y push), material, becas y estado del servidor.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// resolveAthleteId vive junto a requireUser, que importa next-auth: aquí no hace falta
vi.mock("@/auth", () => ({ auth: async () => null }));

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("entrenadora, material, becas y servidor (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let comments: typeof import("./comments-service");
  let athlete: string;
  let coach: string;
  let stranger: string;
  let sessionId: string;

  beforeAll(async () => {
    const { generateVapidKeys } = await import("@/lib/push/send");
    const k = generateVapidKeys();
    vi.stubEnv("VAPID_PUBLIC_KEY", k.publicKey);
    vi.stubEnv("VAPID_PRIVATE_KEY", k.privateKey);
    vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.com");
    prisma = (await import("@/lib/prisma")).prisma;
    comments = await import("./comments-service");
    const t = Date.now();
    athlete = (await prisma.user.create({ data: { email: `la-${t}@test.dev`, name: "Atleta" } })).id;
    coach = (await prisma.user.create({ data: { email: `lc-${t}@test.dev`, name: "Entrenadora", role: "COACH" } })).id;
    stranger = (await prisma.user.create({ data: { email: `ls-${t}@test.dev`, role: "COACH" } })).id;
    await prisma.coachAthlete.create({ data: { coachId: coach, athleteId: athlete, status: "ACTIVE", scopes: ["SESSIONS"] } });
    await prisma.coachAthlete.create({ data: { coachId: stranger, athleteId: athlete, status: "ACTIVE", scopes: ["LOAD"] } });
    for (const [userId, n] of [
      [athlete, 1],
      [coach, 2],
    ] as const) {
      await prisma.pushSubscription.create({ data: { userId, endpoint: `https://push.example/${t}-${n}`, p256dh: "B".repeat(87), auth: "A".repeat(22) } });
    }
    sessionId = (await prisma.trainingSession.create({ data: { userId: athlete, date: new Date("2026-10-05"), type: "TECHNICAL", title: "Lanzamientos" } })).id;
  });

  afterAll(async () => {
    // Las líneas contables impiden borrar cuentas en cascada: primero los asientos
    if (athlete) await prisma.financialTransaction.deleteMany({ where: { userId: athlete } });
    await prisma.user.deleteMany({ where: { id: { in: [athlete, coach, stranger].filter(Boolean) } } });
    vi.unstubAllEnvs();
  });

  it("el coach con permiso de sesiones comenta, el atleta recibe push y responde", async () => {
    const sent: string[] = [];
    const send = async (t: { endpoint: string }) => (sent.push(t.endpoint), { ok: true as const });
    await comments.addComment({ id: coach, role: "COACH" }, sessionId, athlete, "Buen bloqueo en el 4.º", send);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatch(/-1$/);
    await comments.addComment({ id: athlete, role: "ATHLETE" }, sessionId, null, "¡Gracias!", send);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toMatch(/-2$/);
    const thread = await comments.sessionThread({ id: athlete, role: "ATHLETE" }, sessionId);
    expect(thread.map((c) => [c.body, c.fromCoach, c.mine])).toEqual([
      ["Buen bloqueo en el 4.º", true, false],
      ["¡Gracias!", false, true],
    ]);
  });

  it("sin permiso de sesiones o sin vínculo, nada", async () => {
    await expect(comments.sessionThread({ id: stranger, role: "COACH" }, sessionId, athlete)).rejects.toThrow(/sesiones/);
    const other = (await prisma.trainingSession.create({ data: { userId: coach, date: new Date("2026-10-05"), type: "STRENGTH" } })).id;
    await expect(comments.sessionThread({ id: coach, role: "COACH" }, other, athlete)).rejects.toThrow(/no encontrada/);
    const [mine] = await comments.sessionThread({ id: athlete, role: "ATHLETE" }, sessionId);
    await expect(comments.deleteComment({ id: athlete, role: "ATHLETE" }, mine.id)).rejects.toThrow(/no encontrado/);
    await comments.deleteComment({ id: coach, role: "COACH" }, mine.id);
  });

  it("la jabalina cuenta los lanzamientos con su peso desde la compra", async () => {
    const eq = await import("./equipment-service");
    const mk = async (date: string, weight: number, n: number) => {
      const s = await prisma.trainingSession.create({ data: { userId: athlete, date: new Date(date), type: "TECHNICAL" } });
      await prisma.technicalSession.create({
        data: { sessionId: s.id, event: "JAVELIN", implementWeightG: weight, attempts: { create: Array.from({ length: n }, (_, i) => ({ order: i + 1, markM: 50 })) } },
      });
    };
    await mk("2026-09-01", 800, 10); // antes de la compra
    await mk("2026-09-20", 800, 12);
    await mk("2026-09-21", 700, 8); // otro peso
    await eq.createEquipment(athlete, { name: "Nemeth 800", kind: "JAVELIN", implementWeightG: 800, purchasedOn: "2026-09-15", lifeUses: 15 });
    const [j] = await eq.listEquipment(athlete, "2026-10-01");
    expect(j.state).toMatchObject({ uses: 12, usesPct: 80, level: "soon" });
    await prisma.equipment.updateMany({ where: { userId: athlete }, data: { extraUses: { increment: 5 } } });
    expect((await eq.equipmentAlertsToday(athlete, "2026-10-01")).map((a) => a.level)).toEqual(["warn"]);
  });

  it("becas frente a gastos deportivos", async () => {
    const fin = await import("@/lib/finance/service");
    const bank = await prisma.financialAccount.create({ data: { userId: athlete, name: "Banco", type: "ASSET" } });
    const inc = await prisma.financialAccount.create({ data: { userId: athlete, name: "Ingresos", type: "INCOME" } });
    const exp = await prisma.financialAccount.create({ data: { userId: athlete, name: "Gastos", type: "EXPENSE" } });
    const tx = (kind: "INCOME" | "EXPENSE", cents: number, sport: boolean) =>
      prisma.financialTransaction.create({
        data: {
          userId: athlete,
          date: new Date("2026-02-01"),
          kind,
          description: kind,
          sport,
          postings: {
            create:
              kind === "INCOME"
                ? [
                    { accountId: bank.id, amountCents: cents },
                    { accountId: inc.id, amountCents: -cents },
                  ]
                : [
                    { accountId: bank.id, amountCents: -cents },
                    { accountId: exp.id, amountCents: cents },
                  ],
          },
        },
      });
    await tx("INCOME", 150000, true);
    await tx("EXPENSE", 40000, true);
    await tx("EXPENSE", 99999, false);
    const [s] = await fin.sportSeasonBalance(athlete, "2026-06-30");
    expect(s).toMatchObject({ season: "2026", incomeCents: 150000, expenseCents: 40000, balanceCents: 110000 });
  });

  it("estado del servidor: BD, migraciones y última copia", async () => {
    const { serverStatus } = await import("@/lib/admin/status");
    await prisma.backupRun.create({ data: { ok: true, detail: "prueba" } });
    const st = await serverStatus();
    expect(st.db.ok).toBe(true);
    expect(st.migrations?.last?.name).toMatch(/^\d{14}_v\d+_/);
    expect(st.migrations?.failed).toEqual([]);
    expect(st.backup?.ok).toBe(true);
    expect(st.version).toMatch(/^\d+\.\d+\.\d+$/);
    await prisma.backupRun.deleteMany({ where: { detail: "prueba" } });
  });
});
