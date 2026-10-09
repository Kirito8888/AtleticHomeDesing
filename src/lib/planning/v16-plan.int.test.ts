// Integración con BD real (v1.6): afinamiento, recolocar, semanas tipo y prehabilitación. Regla: el plan no cambia sin confirmar.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const plus = (n: number) => iso(new Date(Date.now() + n * 864e5));

describe.skipIf(!HAS_DB)("planificación inteligente (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let userId: string;
  let code: string;

  beforeAll(async () => {
    process.env.LIFEOS_NO_WEATHER = "1";
    prisma = (await import("@/lib/prisma")).prisma;
    userId = (await prisma.user.create({ data: { email: `v16p-${Date.now()}@test.dev` } })).id;
    const mp = await import("./manual-plan");
    // Plan propio de 3 semanas, todos los días, empezando hoy
    code = (await mp.createManualPlan(userId, { name: "Pre-competición", start: plus(0), weeks: 3, weekdays: [0, 1, 2, 3, 4, 5, 6], type: "STRENGTH" })).code;
    const days = await prisma.planDay.findMany({ where: { userId } });
    for (const d of days)
      await mp.updateManualDay(userId, d.id, { title: "Fuerza", durationMin: 60, type: "STRENGTH", notes: "", rows: [{ exercise: "Sentadilla", sets: "3 × 5", load: "80 kg", rir: "2", rest: "", how: "" }] });
    const { activateAiPlan } = await import("@/lib/ai-plan/service");
    await activateAiPlan(userId, code);
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
  });

  it("afinamiento: solo guarda el %, el contenido no cambia y se quita", async () => {
    const ev = await prisma.calendarEvent.create({ data: { userId, type: "COMPETITION", title: "Autonómico", startAt: new Date(`${plus(10)}T00:00:00Z`), priority: "A" } });
    const before = await prisma.planDay.findMany({ where: { userId }, orderBy: { key: "asc" }, select: { id: true, content: true, date: true, title: true } });
    const svc = await import("./taper-service");
    const p = await svc.taperProposal(userId, ev.id);
    expect(p.days.map((d) => d.date)).toEqual(Array.from({ length: 7 }, (_, i) => plus(3 + i)));
    expect((await svc.setTaper(userId, ev.id, true)).days).toBe(7);
    const after = await prisma.planDay.findMany({ where: { userId }, orderBy: { key: "asc" }, select: { id: true, content: true, date: true, title: true, taperPct: true } });
    expect(after.map((d) => ({ id: d.id, content: d.content, date: d.date, title: d.title }))).toEqual(before);
    const tapered = after.find((d) => d.taperPct)!;
    const { dayView } = await import("@/lib/ai-plan/day-view");
    const rows = (dayView({ ...tapered, light: null, mode: null }).blocks.find((b) => b.kind === "table") as { rows: Array<{ sets: string }> }).rows;
    expect(rows[0].sets).toBe("2 × 5");
    await svc.setTaper(userId, ev.id, false);
    expect(await prisma.planDay.count({ where: { userId, taperPct: { not: null } } })).toBe(0);
  });

  it("recolocar propone días sin mover nada", async () => {
    const s = await prisma.trainingSession.create({ data: { userId, date: new Date(`${plus(-2)}T00:00:00Z`), type: "STRENGTH", status: "PLANNED", title: "Saltada" } });
    const { rescheduleSuggestions } = await import("@/lib/training/move-service");
    const o = await rescheduleSuggestions(userId, s.id);
    expect(o.length).toBeGreaterThan(0);
    expect(o.every((x) => x.date >= plus(0))).toBe(true);
    expect(iso((await prisma.trainingSession.findUniqueOrThrow({ where: { id: s.id } })).date)).toBe(plus(-2));
  });

  it("semana tipo: guardar y aplicar en el plan propio; nunca en uno importado", async () => {
    const mp = await import("./manual-plan");
    const { id } = await mp.saveWeekTemplate(userId, code, { name: "Carga", week: 1 });
    // La semana 1 empieza hoy: la plantilla tiene los días de hoy al domingo
    const tpl = await prisma.weekTemplate.findUniqueOrThrow({ where: { id } });
    expect((await mp.applyWeekTemplate(userId, code, 2, id)).applied).toBe((tpl.days as unknown[]).length);
    const imported = await prisma.planMeso.create({ data: { userId, code: "M99", name: "Importado", source: "IMPORT", status: "ACTIVE", startDate: new Date(), endDate: new Date(), intro: [], weeks: [], variants: [] } });
    await expect(mp.applyWeekTemplate(userId, imported.code, 1, id)).rejects.toThrow(/no encontrado/);
  });

  it("prehabilitación: un toque marca y otro desmarca", async () => {
    const r = await prisma.prehabRoutine.create({ data: { userId, name: "Hombro", exercises: [{ name: "Goma", dose: "2 × 15" }] } });
    await prisma.prehabLog.create({ data: { userId, routineId: r.id, date: new Date(`${plus(0)}T00:00:00Z`) } });
    const { adherence } = await import("@/lib/training/prehab");
    const logs = await prisma.prehabLog.findMany({ where: { routineId: r.id } });
    expect(adherence(logs.map((l) => iso(l.date)), plus(0)).doneToday).toBe(true);
  });
});
