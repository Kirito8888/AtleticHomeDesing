// Integración con BD real: importar el plan, reimportar sin duplicar, respetar lo
// ya hecho y cambiar de versión. Datos ficticios construidos en el test.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ParsedUpload } from "./files";
import type { ParsedDay, ParsedMeso } from "./types";

const HAS_DB = Boolean(process.env.DATABASE_URL);

const table = (exercise: string) => [{ kind: "table" as const, rows: [{ exercise, sets: "3 × 5", load: "80 %", rir: "2", rest: "3 min", how: "", ramp: false }] }];

function day(meso: string, date: string | null, title: string, extra: Partial<ParsedDay> = {}): ParsedDay {
  const variant = extra.variant ?? null;
  return {
    key: `${meso}|${variant ?? "-"}|${date ?? `D${extra.relDay}`}|1`,
    meso,
    variant,
    week: 1,
    code: "S1",
    date,
    relDay: null,
    weekday: "LUNES",
    title,
    durationMin: 90,
    competition: false,
    type: "STRENGTH",
    weekTitle: "Entrada",
    blocks: table(title),
    ...extra,
  };
}

function meso(code: string, start: string, end: string, days: ParsedDay[], extra: Partial<ParsedMeso> = {}): ParsedMeso {
  return {
    code,
    name: "Acumulación de prueba",
    start,
    end,
    version: "1",
    intro: [],
    annexes: [],
    weeks: [{ variant: null, number: 1, title: "Entrada", start, end: start, text: "" }],
    days,
    variants: [],
    defaultVariant: null,
    warnings: [],
    ...extra,
  };
}

const m5 = (titles = ["Sentadilla", "Press", "Snatch"]) =>
  meso("M5", "2026-10-26", "2026-11-22", [day("M5", "2026-10-26", titles[0]), day("M5", "2026-10-27", titles[1]), ...(titles[2] ? [day("M5", "2026-10-28", titles[2])] : [])]);

const m9 = meso(
  "M9",
  "2027-02-15",
  "2027-02-28",
  [
    day("M9", "2027-02-15", "Taper A", { variant: "A" }),
    day("M9", "2027-02-26", "CAMPEONATO DE ESPAÑA", { variant: "A-V", week: 2, competition: true, type: "TECHNICAL" }),
    day("M9", "2027-02-27", "CAMPEONATO DE ESPAÑA", { variant: "A-S", week: 2, competition: true, type: "TECHNICAL" }),
    day("M9", "2027-02-15", "Carga B", { variant: "B" }),
    day("M9", "2027-02-22", "Carga B 2", { variant: "B", week: 2 }),
  ],
  {
    variants: [
      { code: "A-V", label: "A viernes" },
      { code: "A-S", label: "A sábado" },
      { code: "B", label: "B" },
    ],
    defaultVariant: "B",
  },
);

const m16 = meso(
  "M16",
  "2027-07-12",
  "2027-09-05",
  [
    day("M16", "2027-07-12", "Recuperación", { variant: "N" }),
    day("M16", "2027-08-02", "Descanso activo", { week: 4 }),
    day("M16", null, "Snatch ligero", { variant: "C", relDay: -5, code: "C·D−5" }),
    day("M16", null, "EUROPEO SUB-23", { variant: "C", relDay: 0, code: "C·D", competition: true }),
  ],
  {
    variants: [
      { code: "N", label: "Plan normal" },
      { code: "C", label: "Si me clasifico" },
    ],
    defaultVariant: "N",
  },
);

const upload = (...mesos: ParsedMeso[]): ParsedUpload => ({ mesos, skipped: [] });

describe.skipIf(!HAS_DB)("plan importado (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("./service");
  let userId: string;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    svc = await import("./service");
    userId = (await prisma.user.create({ data: { email: `plan-${Date.now()}@test.dev` } })).id;
  });
  afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } });
  });

  const planned = (where: object = {}) =>
    prisma.trainingSession.findMany({ where: { userId, ...where }, orderBy: [{ date: "asc" }, { title: "asc" }], select: { id: true, date: true, title: true, status: true, cycleId: true } });
  const titles = async (where: object = {}) => (await planned(where)).map((s) => `${s.date.toISOString().slice(0, 10)} ${s.title}`);

  it("importa: sesiones planificadas solo de la versión activa, ciclos y vista previa", async () => {
    const preview = await svc.previewPlanImport(userId, upload(m5(), m9, m16));
    expect(preview.totalDays).toBe(12);
    expect(preview.mesos.map((m) => [m.code, m.diff.created, m.currentVariant])).toEqual([
      ["M5", 3, null],
      ["M9", 5, null],
      ["M16", 4, null],
    ]);

    const r = await svc.commitPlanImport(userId, upload(m5(), m9, m16));
    // M5: 3 · M9 (B): 2 · M16 (N): 1 + 1 común; la rama C no tiene fecha hasta elegirla.
    expect(r).toMatchObject({ days: 12, sessionsCreated: 7, events: 0 });
    expect(await titles()).toEqual([
      "2026-10-26 Sentadilla",
      "2026-10-27 Press",
      "2026-10-28 Snatch",
      "2027-02-15 Carga B",
      "2027-02-22 Carga B 2",
      "2027-07-12 Recuperación",
      "2027-08-02 Descanso activo",
    ]);
    expect((await planned()).every((s) => s.status === "PLANNED")).toBe(true);

    const cycles = await prisma.trainingCycle.findMany({ where: { userId }, orderBy: [{ level: "asc" }, { startDate: "asc" }] });
    expect(cycles.filter((c) => c.level === "MACRO").map((c) => [c.name, c.startDate.toISOString().slice(0, 10), c.endDate.toISOString().slice(0, 10)])).toEqual([
      ["Temporada 2026-27", "2026-10-26", "2027-09-05"],
    ]);
    expect(cycles.filter((c) => c.level === "MESO").map((c) => [c.name, c.phase])).toEqual([
      ["M5 · Acumulación de prueba", "GENERAL_PREP"],
      ["M9 · Acumulación de prueba", "GENERAL_PREP"],
      ["M16 · Acumulación de prueba", "GENERAL_PREP"],
    ]);
    // La sesión del lunes cuelga del microciclo S1 de M5.
    const s1 = cycles.find((c) => c.level === "MICRO" && c.name.startsWith("M5 · S1"));
    expect((await planned({ title: "Sentadilla" }))[0].cycleId).toBe(s1?.id);
  });

  it("reimportar lo mismo no cambia nada", async () => {
    const preview = await svc.previewPlanImport(userId, upload(m5(), m9, m16));
    expect(preview.mesos.map((m) => [m.diff.created, m.diff.changed, m.diff.unchanged])).toEqual([
      [0, 0, 3],
      [0, 0, 5],
      [0, 0, 4],
    ]);
    const before = (await planned()).map((s) => s.id);
    const r = await svc.commitPlanImport(userId, upload(m5(), m9, m16));
    expect(r.sessionsCreated).toBe(0);
    expect((await planned()).map((s) => s.id)).toEqual(before);
  });

  it("versión nueva del PDF: actualiza lo planificado, respeta lo hecho y retira lo que sobra", async () => {
    const [mon] = await planned({ title: "Sentadilla" });
    await prisma.trainingSession.update({ where: { id: mon.id }, data: { status: "COMPLETED", title: "Sentadilla (hecha)" } });

    const v2 = m5(["Sentadilla pesada", "Press inclinado", ""]);
    const preview = await svc.previewPlanImport(userId, upload(v2));
    expect(preview.mesos[0].diff).toEqual({ created: 0, changed: 1, unchanged: 0, removed: 1, keptDone: 1 });

    const r = await svc.commitPlanImport(userId, upload(v2));
    expect(r).toMatchObject({ keptDone: 1, sessionsUpdated: 1, sessionsRemoved: 1, removedDays: 1 });
    expect(await titles({ date: { lt: new Date("2027-01-01") } })).toEqual(["2026-10-26 Sentadilla (hecha)", "2026-10-27 Press inclinado"]);
    // El día sigue enlazado a la sesión hecha (el detalle muestra el plan).
    expect((await svc.planDayForSession(userId, mon.id))?.title).toBe("Sentadilla pesada");
  });

  it("cambiar de versión: A (compito el viernes) crea su competición y retira la B", async () => {
    await expect(svc.setPlanVariant(userId, "M9", "Z")).rejects.toThrow(/no existe/);
    await svc.setPlanVariant(userId, "M9", "A-V");
    expect(await titles({ date: { gte: new Date("2027-02-01"), lt: new Date("2027-03-01") } })).toEqual(["2027-02-15 Taper A", "2027-02-26 CAMPEONATO DE ESPAÑA"]);
    const events = await prisma.calendarEvent.findMany({ where: { userId } });
    expect(events.map((e) => [e.type, e.title, e.startAt.toISOString().slice(0, 10)])).toEqual([["COMPETITION", "CAMPEONATO DE ESPAÑA", "2027-02-26"]]);

    await svc.setPlanVariant(userId, "M9", "B");
    expect(await titles({ date: { gte: new Date("2027-02-01"), lt: new Date("2027-03-01") } })).toEqual(["2027-02-15 Carga B", "2027-02-22 Carga B 2"]);
    expect(await prisma.calendarEvent.count({ where: { userId } })).toBe(0);
  });

  it("rama «Si me clasifico»: pide la fecha de la competición y cuenta hacia atrás", async () => {
    await expect(svc.setPlanVariant(userId, "M16", "C")).rejects.toThrow(/indica su fecha/);
    await svc.setPlanVariant(userId, "M16", "C", "2027-07-24");
    expect(await titles({ date: { gte: new Date("2027-07-01") } })).toEqual(["2027-07-19 Snatch ligero", "2027-07-24 EUROPEO SUB-23", "2027-08-02 Descanso activo"]);
    const overview = await svc.planOverview(userId);
    expect(overview.find((m) => m.code === "M16")).toMatchObject({ variant: "C", anchorDate: "2027-07-24" });
    expect(overview.find((m) => m.code === "M16")?.variants).toEqual([
      { code: "N", label: "Plan normal", needsAnchor: false },
      { code: "C", label: "Si me clasifico", needsAnchor: true },
    ]);
  });

  it("borrar un bloque quita lo planificado y deja lo hecho", async () => {
    const r = await svc.deletePlanMeso(userId, "M5");
    expect(r).toEqual({ sessionsRemoved: 1 });
    expect(await titles({ date: { lt: new Date("2027-01-01") } })).toEqual(["2026-10-26 Sentadilla (hecha)"]);
    expect(await prisma.planMeso.count({ where: { userId, code: "M5" } })).toBe(0);
    expect(await prisma.trainingCycle.count({ where: { userId, name: { startsWith: "M5" } } })).toBe(0);
  });
});
