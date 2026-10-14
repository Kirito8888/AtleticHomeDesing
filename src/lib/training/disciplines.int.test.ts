// Integración con BD real (v2.1): sesiones de pista con series y regresión de las de lanzamientos.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("disciplinas: carreras sin alterar lanzamientos (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let service: typeof import("./service");
  let userId: string;

  beforeAll(async () => {
    process.env.LIFEOS_NO_WEATHER = "1";
    prisma = (await import("@/lib/prisma")).prisma;
    service = await import("./service");
    userId = (await prisma.user.create({ data: { email: `v21a-${Date.now()}@test.dev` } })).id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
  });

  it("guarda la especialidad en el perfil", async () => {
    await prisma.athleteProfile.create({ data: { userId, primaryDiscipline: "SPRINT", primaryEvent: "100m" } });
    expect((await prisma.athleteProfile.findUniqueOrThrow({ where: { userId } })).primaryEvent).toBe("100m");
  });

  it("pista con series: guarda discipline, ritmo e intervalos con centésimas", async () => {
    const s = await service.createTrainingSession(userId, null, {
      date: "2026-10-05",
      type: "TRACK",
      discipline: "SPRINT",
      status: "COMPLETED",
      durationSec: 3600,
      sessionRpe: 7,
      track: {
        modality: "SPRINT",
        surface: "TRACK",
        hrZoneSeconds: [],
        intervals: [
          { repetition: 1, distanceM: 150, timeSec: 18.2, isStartBlocks: false, isFlying: false, splitsSec: [] },
          { repetition: 2, distanceM: 150, timeSec: 17.9, isStartBlocks: false, isFlying: false, splitsSec: [] },
        ],
      },
    } as Parameters<typeof service.createTrainingSession>[2]);
    const row = await prisma.trainingSession.findUniqueOrThrow({ where: { id: s.id }, include: { track: { include: { intervals: { orderBy: { order: "asc" } } } } } });
    expect(row.discipline).toBe("SPRINT");
    expect(row.track?.intervals.map((i) => i.timeSec)).toEqual([18.2, 17.9]);
    expect(row.tss).not.toBeNull();
    const { intervalStats } = await import("./disciplines");
    expect(intervalStats(row.track!.intervals)).toMatchObject({ count: 2, totalM: 300, bestTimeSec: 17.9 });
  });

  it("regresión: una sesión de lanzamientos conserva mejor marca, TSS técnico y su titular", async () => {
    const s = await service.createTrainingSession(userId, null, {
      date: "2026-10-06",
      type: "TECHNICAL",
      discipline: "THROWS",
      status: "COMPLETED",
      durationSec: 3600,
      sessionRpe: 6,
      technical: {
        event: "JAVELIN",
        implementWeightG: 800,
        isCompetition: false,
        attempts: [{ markM: 55.5, isFoul: false, isMeasured: true }, { markM: 58.25, isFoul: false, isMeasured: true }, { markM: null, isFoul: true, isMeasured: false }],
      },
    } as Parameters<typeof service.createTrainingSession>[2]);
    const row = await prisma.trainingSession.findUniqueOrThrow({ where: { id: s.id }, include: { technical: true } });
    expect(row.technical?.bestMarkM).toBe(58.25);
    expect(row.tssMethod).toBe("SRPE");
    expect(row.tss).toBe(85.7); // sRPE: 60 min × RPE 6 / (7 × 60) × 100 (tss.ts, sin tocar)
    const { sessionHeadline } = await import("./disciplines");
    expect(sessionHeadline({ technical: row.technical })).toBe("Jabalina · 58,25 m");
  });
});
