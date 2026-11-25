// v3.2 · Bloque J (V3-N05): reenviar desde la bandeja una toma, agua o hábito no duplica.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: async () => null }));
vi.mock("server-only", () => ({}));

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("reenvío sin conexión de tomas, agua y hábitos (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let food: typeof import("./service");
  let water: typeof import("./hydration-service");
  let habits: typeof import("@/lib/study/schedule-service");
  let a: string;
  let b: string;
  const day = "2026-11-25";

  const custom = (extra: Record<string, unknown> = {}) =>
    food.createEntrySchema.parse({ date: day, mealType: "LUNCH", customName: "Arroz", quantityG: 200, kcal: 260, proteinG: 5, carbsG: 56, fatG: 1, ...extra });

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    food = await import("./service");
    water = await import("./hydration-service");
    habits = await import("@/lib/study/schedule-service");
    const t = Date.now();
    a = (await prisma.user.create({ data: { email: `ja-${t}@test.dev`, name: "A" } })).id;
    b = (await prisma.user.create({ data: { email: `jb-${t}@test.dev`, name: "B" } })).id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [a, b] } } });
  });

  it("la misma clientKey de una toma, enviada dos veces, crea una sola entrada", async () => {
    const first = await food.createEntry(a, custom({ clientKey: "toma-1" }));
    const again = await food.createEntry(a, custom({ clientKey: "toma-1" }));
    expect(again.id).toBe(first.id);
    expect(await prisma.macros.count({ where: { userId: a, clientKey: "toma-1" } })).toBe(1);
  });

  it("dos reenvíos a la vez tampoco duplican", async () => {
    const rs = await Promise.all([food.createEntry(a, custom({ clientKey: "toma-2" })), food.createEntry(a, custom({ clientKey: "toma-2" }))]);
    expect(rs[0].id).toBe(rs[1].id);
    expect(await prisma.macros.count({ where: { userId: a, clientKey: "toma-2" } })).toBe(1);
  });

  it("sin clientKey cada envío es una toma (anotar a mano no cambia)", async () => {
    await food.createEntry(a, custom());
    await food.createEntry(a, custom());
    expect(await prisma.macros.count({ where: { userId: a, clientKey: null, customName: "Arroz" } })).toBe(2);
  });

  it("la misma clave en otra cuenta crea su propia toma y nunca devuelve la ajena", async () => {
    const mine = await food.createEntry(a, custom({ clientKey: "toma-3" }));
    const theirs = await food.createEntry(b, custom({ clientKey: "toma-3" }));
    expect(theirs.id).not.toBe(mine.id);
    expect(theirs.userId).toBe(b);
  });

  it("agua: la misma clientKey suma una sola vez, también a la vez", async () => {
    const w = (extra: Record<string, unknown>) => water.waterSchema.parse({ date: day, ml: 250, ...extra });
    const first = await water.addWater(a, w({ clientKey: "agua-1" }));
    expect((await water.addWater(a, w({ clientKey: "agua-1" }))).id).toBe(first.id);
    const par = await Promise.all([water.addWater(a, w({ clientKey: "agua-2" })), water.addWater(a, w({ clientKey: "agua-2" }))]);
    expect(par[0].id).toBe(par[1].id);
    expect(await prisma.hydrationLog.count({ where: { userId: a, clientKey: { in: ["agua-1", "agua-2"] } } })).toBe(2);
    const other = await water.addWater(b, w({ clientKey: "agua-1" }));
    expect(other.id).not.toBe(first.id);
    await water.addWater(a, w({}));
    await water.addWater(a, w({}));
    expect(await prisma.hydrationLog.count({ where: { userId: a, clientKey: null } })).toBe(2);
  });

  it("hábito: reenviar el mismo estado deja un solo registro (o ninguno), sin campo nuevo", async () => {
    const h = await prisma.habit.create({ data: { userId: a, name: "Estirar" } });
    await habits.toggleHabit(a, h.id, day, true);
    await habits.toggleHabit(a, h.id, day, true);
    expect(await prisma.habitLog.count({ where: { habitId: h.id } })).toBe(1);
    await habits.toggleHabit(a, h.id, day, false);
    await habits.toggleHabit(a, h.id, day, false);
    expect(await prisma.habitLog.count({ where: { habitId: h.id } })).toBe(0);
    await expect(habits.toggleHabit(b, h.id, day, true)).rejects.toThrow(); // el hábito de otra cuenta no se toca
  });
});
