// Integración con BD real: semanas «VFC» del plan + aviso de VFC, y tendencias de meses de cada usuaria.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("tendencias y semanas de VFC (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let rules: typeof import("@/lib/rules/rules-service");
  let trends: typeof import("./trends-service");
  let a: string;
  let b: string;
  const TODAY = "2026-11-11";
  const stamp = Date.now();

  const hrv = (userId: string, week: string, v: number) =>
    Promise.all([0, 1, 2].map((i) => prisma.recoveryMetrics.create({ data: { userId, date: new Date(Date.parse(`${week}T00:00:00Z`) + i * 864e5), hrvRmssdMs: v } })));

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    rules = await import("@/lib/rules/rules-service");
    trends = await import("./trends-service");
    a = (await prisma.user.create({ data: { email: `trend-a-${stamp}@test.dev` } })).id;
    b = (await prisma.user.create({ data: { email: `trend-b-${stamp}@test.dev` } })).id;
    for (const u of [a, b]) {
      await hrv(u, "2026-10-26", 100);
      await hrv(u, "2026-11-02", 100);
      await hrv(u, "2026-11-09", 90); // −10 %
    }
    // a: la semana del 9/11 está marcada «VFC» en su plan; b no tiene plan.
    await prisma.planMeso.create({
      data: {
        userId: a,
        code: "M5",
        name: "Prueba",
        startDate: new Date("2026-10-26"),
        endDate: new Date("2026-11-22"),
        intro: [],
        weeks: [
          { variant: null, number: 1, title: "Entrada", start: "2026-11-02", end: "2026-11-08", text: "", hrv: false },
          { variant: null, number: 2, title: "Carga · VFC", start: "2026-11-09", end: "2026-11-15", text: "", hrv: true },
        ],
        variants: [],
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [a, b] } } });
  });

  it("el aviso de VFC solo salta en la semana marcada del plan", async () => {
    expect((await rules.rulesToday(a, TODAY)).map((x) => x.id)).toContain("hrv-info");
    expect((await rules.rulesToday(b, TODAY)).map((x) => x.id)).not.toContain("hrv-info");
  });

  it("las tendencias son de cada usuaria y cuentan las semanas marcadas", async () => {
    const ta = await trends.trendsFor(a, TODAY);
    const tb = await trends.trendsFor(b, TODAY);
    expect(ta.hrvWeeks).toBe(1);
    expect(tb.hrvWeeks).toBe(0);
    expect(ta.months.at(-1)).toMatchObject({ month: "2026-11", hrvN: 6, hrvMarkedN: 3 });
    expect(tb.months.at(-1)).toMatchObject({ month: "2026-11", hrvN: 6, hrvMarkedN: 0 });
  });
});
