// Importar historial: carga recalculada una sola vez (skipLoads), sin duplicados al reimportar y aislada por usuaria.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { testStamp } from "@/test/stamp";

vi.mock("@/auth", () => ({ auth: async () => null }));
// Cuenta las llamadas a recomputeDailyLoads sin cambiar su comportamiento.
vi.mock("@/lib/training/service", async (orig) => {
  const m = await orig<typeof import("@/lib/training/service")>();
  return { ...m, recomputeDailyLoads: vi.fn(m.recomputeDailyLoads) };
});

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("importar historial (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("./history-import-service");
  let training: typeof import("./service");
  const t = testStamp();
  let seq = 0;

  async function user(tag: string) {
    const id = (await prisma.user.create({ data: { email: `hist${tag}${seq++}-${t}@test.dev` } })).id;
    await prisma.athleteProfile.create({ data: { userId: id, sex: "FEMALE", ctlTimeConstant: 42, atlTimeConstant: 7 } });
    return id;
  }
  const rows = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      line: i + 5,
      date: `2026-10-${String(1 + i).padStart(2, "0")}`,
      title: `Sesión sintética ${i}`,
      kind: (["TRACK", "STRENGTH", "MIXED"] as const)[i % 3],
      modality: i % 3 === 0 ? ("RUN" as const) : null,
      distanceM: i % 3 === 0 ? 5000 + i * 100 : null,
      durationSec: 1800 + 300 * (i % 6),
      rpe: 3 + (i % 6),
      manualTss: null,
      notes: null,
      typeText: null,
    }));
  const loads = (userId: string) => prisma.dailyLoad.findMany({ where: { userId }, orderBy: { date: "asc" }, select: { date: true, tss: true, ctl: true, atl: true, tsb: true } });

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    svc = await import("./history-import-service");
    training = await import("./service");
  });
  afterAll(async () => {
    // Las series bloquean borrar el ejercicio (restricción): primero las sesiones
    await prisma.trainingSession.deleteMany({ where: { user: { email: { contains: `-${t}@test.dev` } } } });
    await prisma.user.deleteMany({ where: { email: { contains: `-${t}@test.dev` } } });
  });

  it("carga igual que día a día, recalculada una vez; reimportar no duplica", async () => {
    const a = await user("a");
    const data = rows(20);
    vi.mocked(training.recomputeDailyLoads).mockClear();
    const res = await svc.importHistory(a, data);
    expect(res).toMatchObject({ created: 20, duplicates: 0, earliest: "2026-10-01" });
    expect(training.recomputeDailyLoads).toHaveBeenCalledTimes(1);
    const batch = await loads(a);
    expect(batch.length).toBeGreaterThan(19);
    expect(batch.some((l) => l.tss > 0 && l.ctl > 0)).toBe(true);

    // Referencia: las mismas sesiones creadas una a una recalculando cada vez.
    const ref = await user("ref");
    for (const r of data) await training.createTrainingSession(ref, null, svc.rowToSession(r));
    // El día a día parte de semillas ya redondeadas a 2 decimales: puede diferir ~0,01 en CTL/TSB.
    const dayByDay = await loads(ref);
    expect(dayByDay.map((l) => l.date)).toEqual(batch.map((l) => l.date));
    dayByDay.forEach((l, i) => {
      for (const k of ["tss", "ctl", "atl", "tsb"] as const) expect(Math.abs(l[k] - batch[i][k])).toBeLessThan(0.1);
    });

    // Reimportar: todo duplicado, sin sesiones nuevas y sin recalcular.
    vi.mocked(training.recomputeDailyLoads).mockClear();
    const again = await svc.importHistory(a, data);
    expect(again).toMatchObject({ created: 0, duplicates: 20, earliest: null });
    expect(training.recomputeDailyLoads).not.toHaveBeenCalled();
    expect(await prisma.trainingSession.count({ where: { userId: a } })).toBe(20);
    const prev = await svc.previewHistory(a, data);
    expect(prev.counts).toMatchObject({ new: 0, duplicate: 20 });
  });

  it("duplicados: sesión manual previa, repetida en el fichero y clave con tildes/mayúsculas", async () => {
    const a = await user("d");
    await training.createTrainingSession(a, null, { date: "2026-10-03", type: "MIXED", status: "COMPLETED", title: "Rodaje  FÁCIL", durationSec: 2700, sessionRpe: 4 } as never);
    const base = { kind: "MIXED" as const, rpe: 4 };
    const data = [
      { ...base, line: 1, date: "2026-10-03", title: "rodaje facil", durationSec: 2700 }, // = la manual
      { ...base, line: 2, date: "2026-10-04", title: "Otra", durationSec: 1800 },
      { ...base, line: 3, date: "2026-10-04", title: "otra", durationSec: 1800 }, // repetida en el fichero
      { ...base, line: 4, date: "2026-10-04", title: "Otra", durationSec: 1900 }, // distinta duración: nueva
    ];
    const prev = await svc.previewHistory(a, data);
    expect(prev.items.map((i) => i.status)).toEqual(["duplicate", "new", "duplicate_in_file", "new"]);
    expect(prev.counts).toMatchObject({ new: 2, duplicate: 1, duplicateInFile: 1 });
    expect(await svc.importHistory(a, data)).toMatchObject({ created: 2, duplicates: 2 });
    expect(await prisma.trainingSession.count({ where: { userId: a } })).toBe(3);
  });

  it("aislamiento: otra usuaria con las mismas filas no choca ni se toca", async () => {
    const a = await user("iso-a");
    const b = await user("iso-b");
    const data = rows(6);
    await svc.importHistory(a, data);
    const aSessions = await prisma.trainingSession.findMany({ where: { userId: a }, select: { id: true, tss: true } });
    const aLoads = await loads(a);
    expect((await svc.previewHistory(b, data)).counts).toMatchObject({ new: 6, duplicate: 0 });
    expect(await svc.importHistory(b, data.slice(0, 3))).toMatchObject({ created: 3, duplicates: 0 });
    expect(await prisma.trainingSession.count({ where: { userId: b } })).toBe(3);
    expect(await prisma.trainingSession.findMany({ where: { userId: a }, select: { id: true, tss: true } })).toEqual(aSessions);
    expect(await loads(a)).toEqual(aLoads);
    // Y al revés: lo de B no aparece como duplicado de A.
    expect((await svc.previewHistory(a, data)).counts.duplicate).toBe(6);
    expect(await prisma.trainingSession.count({ where: { userId: a, id: { notIn: aSessions.map((s) => s.id) } } })).toBe(0);
  });

  it("sin duración ni RPE se guarda pero no suma carga; el TSS manual sí", async () => {
    const a = await user("nl");
    const base = { kind: "STRENGTH" as const, line: 1 };
    await svc.importHistory(a, [
      { ...base, date: "2026-10-05", title: "Sin datos" },
      { ...base, line: 2, date: "2026-10-06", title: "Con TSS", manualTss: 55 },
    ]);
    const s = await prisma.trainingSession.findMany({ where: { userId: a }, orderBy: { date: "asc" }, select: { title: true, tss: true, status: true, source: true, tags: true } });
    expect(s.map((x) => [x.title, x.tss])).toEqual([["Sin datos", null], ["Con TSS", 55]]);
    expect(s.every((x) => x.status === "COMPLETED" && x.source === null && x.tags.includes("importado"))).toBe(true);
    expect((await loads(a)).some((l) => l.tss === 55)).toBe(true);
  });

  it("con series: crea el ejercicio si no existe, reutiliza el de la biblioteca y las marcas salen de los kg", async () => {
    const a = await user("sets");
    const name = `Ejercicio nuevo ${t}`;
    const row = (title: string, date: string, exercise: string) => ({
      kind: "STRENGTH" as const,
      line: 1,
      date,
      title,
      sets: [
        { exercise, reps: 5, weightKg: 100 },
        { exercise, reps: 5, weightKg: 100 },
      ],
    });
    const res = await svc.importHistory(a, [row("Pierna", "2026-10-05", name), row("Pierna 2", "2026-10-06", name.toUpperCase())]);
    expect(res.created).toBe(2);
    expect(await prisma.exercise.count({ where: { userId: a } })).toBe(1);
    const sets = await prisma.strengthSet.findMany({ where: { strengthSession: { session: { userId: a } } }, select: { weightKg: true, reps: true, order: true } });
    expect(sets).toHaveLength(4);
    expect(sets.every((x) => x.weightKg === 100 && x.reps === 5)).toBe(true);
    expect((await svc.previewHistory(a, [row("Pierna 3", "2026-10-07", name)])).counts.sets).toBe(2);
  });
});
