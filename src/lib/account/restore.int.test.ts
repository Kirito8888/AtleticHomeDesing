// Integración con BD real (v1.6): exportar una cuenta y restaurarla en otra vacía.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("restaurar una exportación (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let from: string;
  let to: string;

  beforeAll(async () => {
    process.env.LIFEOS_NO_WEATHER = "1";
    prisma = (await import("@/lib/prisma")).prisma;
    const t = Date.now();
    from = (await prisma.user.create({ data: { email: `rs1-${t}@test.dev` } })).id;
    to = (await prisma.user.create({ data: { email: `rs2-${t}@test.dev` } })).id;
    const { createTrainingSession } = await import("@/lib/training/service");
    await createTrainingSession(from, null, { date: "2026-10-01", type: "TECHNICAL", status: "COMPLETED", sessionRpe: 6, durationSec: 3600, tags: ["bloqueo"], technical: { event: "JAVELIN", implementWeightG: 800, isCompetition: false, attempts: [{ markM: 50.5, isFoul: false, isMeasured: true }] } } as never);
    await prisma.recoveryMetrics.create({ data: { userId: from, date: new Date("2026-10-01"), sleepHours: 7.5, readinessParts: { tsb: 1 } } });
    const h = await prisma.habit.create({ data: { userId: from, name: "Estirar" } });
    await prisma.habitLog.create({ data: { userId: from, habitId: h.id, date: new Date("2026-10-01") } });
    // v1.6
    const exam = await prisma.classSlot.create({ data: { userId: from, subject: "Cálculo", kind: "EXAM", date: new Date("2026-10-20"), startMin: 540, endMin: 660 } });
    await prisma.studyPlanBlock.create({ data: { userId: from, examId: exam.id, subject: "Cálculo", date: new Date("2026-10-18"), minutes: 60, done: true } });
    const rice = await prisma.recipe.create({ data: { userId: from, name: "Arroz", servings: 2, items: [{ name: "Arroz", grams: 200, kcal100: 350, protein100: 7, carbs100: 77, fat100: 1 }] } });
    // v1.7
    await prisma.mealPlanEntry.create({ data: { userId: from, recipeId: rice.id, date: new Date("2026-10-05"), mealType: "LUNCH", servings: 2 } });
    const iron = await prisma.supplement.create({ data: { userId: from, name: "Hierro", days: [1, 3, 5] } });
    await prisma.supplementLog.create({ data: { userId: from, supplementId: iron.id, date: new Date("2026-10-05") } });
    await prisma.sweatTest.create({ data: { userId: from, date: new Date("2026-10-02"), minutes: 60, preKg: 70, postKg: 69, fluidMl: 300 } });
    await prisma.assignment.create({ data: { userId: from, subject: "Física", title: "Práctica", dueOn: new Date("2026-10-30") } });
    await prisma.seasonBudget.create({ data: { userId: from, season: 2026, lines: { gear: 30000 }, perCompetitionCents: 5000 } });
    const { addWellbeing } = await import("@/lib/recovery/wellbeing-service");
    await addWellbeing(from, { kind: "MOOD", date: "2026-10-03", mood: 4, stress: 2 });
    await prisma.grade.create({ data: { userId: from, subject: "Anatomía", grade: 8, credits: 6 } });
    const pr = await prisma.prehabRoutine.create({ data: { userId: from, name: "Hombro", exercises: [{ name: "Rotación externa", dose: "3×15" }] } });
    await prisma.prehabLog.create({ data: { userId: from, routineId: pr.id, date: new Date("2026-10-01") } });
    // v1.8
    await prisma.weeklyReview.create({ data: { userId: from, weekStart: new Date("2026-09-28"), summary: { sessions: 1 }, focus: "Dormir" } });
    const habit = await prisma.habit.findFirstOrThrow({ where: { userId: from } });
    await prisma.goal.create({ data: { userId: from, kind: "HABIT", title: "Racha", target: 30, linkRef: habit.id } });
    await prisma.goal.create({ data: { userId: from, kind: "CUSTOM", title: "Libros", target: 12, current: 4 } });
    // v2.0: mazo con progreso propio y club con cuota (se exportan; no se restauran)
    const deck = await prisma.flashcardDeck.create({ data: { userId: from, name: "Huesos", cards: { create: [{ front: "a", back: "b" }] } }, include: { cards: true } });
    await prisma.flashcardReview.create({ data: { userId: from, cardId: deck.cards[0].id } });
    const org = await prisma.organization.create({ data: { name: "Club test" } });
    const member = await prisma.orgMember.create({ data: { orgId: org.id, userId: from, status: "ACTIVE" } });
    await prisma.orgFee.create({ data: { orgId: org.id, memberId: member.id, concept: "Cuota", amountCents: 2000, dueDate: new Date("2026-10-31") } });
    // v2.1: pista con disciplina, ejercicio propio con vídeo, especialidad, curva propia y protocolo (se exportan; vídeo y vínculos no se restauran)
    await createTrainingSession(from, null, { date: "2026-10-02", type: "TRACK", status: "COMPLETED", sessionRpe: 7, durationSec: 3000, discipline: "SPRINT", track: { modality: "SPRINT", intervals: [{ order: 1, distanceM: 100, timeSec: 11.5 }] } } as never);
    await prisma.athleteProfile.upsert({ where: { userId: from }, create: { userId: from, primaryEvent: "100m" }, update: { primaryEvent: "100m" } });
    await prisma.exercise.create({ data: { userId: from, name: "Salto con vallas", description: "Vallas bajas", videoPath: "u/clip.mp4.enc", videoMime: "video/mp4", videoBytes: 1234 } });
    await prisma.referenceCurve.create({ data: { createdById: from, testKey: "cmj", unit: "cm", higherIsBetter: true, title: "Curva test", study: "Estudio", authors: "Autora", year: 2020, citation: "Autora (2020)", points: [{ x: 20, p50: 30 }] } });
    await prisma.physioProtocol.create({ data: { ownerId: from, title: "Protocolo test", phases: [] } });
    const profile = { birthDate: new Date("2004-03-09"), sex: "FEMALE" as const, heightCm: 172, primaryDiscipline: "SPRINT" as const, primaryEvent: "100m", disciplines: ["SPRINT" as const, "JUMPS" as const], ctlTimeConstant: 50, atlTimeConstant: 10, prefs: { throwMinHours: 30 } };
    await prisma.athleteProfile.upsert({ where: { userId: from }, create: { userId: from, ...profile }, update: profile });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [from, to].filter(Boolean) } } });
    await prisma.organization.deleteMany({ where: { name: "Club test" } });
  });

  it("restaura entrenos, recuperación y hábitos; no en una cuenta con datos", async () => {
    const { exportAccount } = await import("./service");
    const { restoreExport } = await import("./restore");
    const data = JSON.parse(JSON.stringify(await exportAccount(from)));
    const r = await restoreExport(to, data);
    expect(r.counts).toMatchObject({ sesiones: 2, "días de recuperación": 1, hábitos: 1 });
    const s = await prisma.trainingSession.findFirstOrThrow({ where: { userId: to, type: "TECHNICAL" }, include: { technical: true } });
    expect(s.technical?.bestMarkM).toBe(50.5);
    expect(await prisma.habitLog.count({ where: { userId: to } })).toBe(1);
    expect(r.counts).toMatchObject({ "plan de estudio": 1, recetas: 1, notas: 1, prehabilitación: 1 });
    const [slot, block] = await Promise.all([prisma.classSlot.findFirstOrThrow({ where: { userId: to } }), prisma.studyPlanBlock.findFirstOrThrow({ where: { userId: to } })]);
    expect(block).toMatchObject({ examId: slot.id, done: true });
    expect(await prisma.prehabLog.count({ where: { userId: to } })).toBe(1);
    // v1.7
    expect(r.counts).toMatchObject({ "plan de comidas": 1, "tomas de suplementos": 1, "pruebas de sudoración": 1, "trabajos y entregas": 1, "presupuestos de temporada": 1, bienestar: 1 });
    expect(s.tags).toEqual(["bloqueo"]);
    // v1.8: revisión y objetivos (el de racha, enlazado al hábito nuevo)
    expect(r.counts).toMatchObject({ "revisiones semanales": 1, objetivos: 2 });
    const newHabit = await prisma.habit.findFirstOrThrow({ where: { userId: to } });
    expect(await prisma.goal.findFirstOrThrow({ where: { userId: to, kind: "HABIT" } })).toMatchObject({ linkRef: newHabit.id });
    expect(data.app.notifications).toBeDefined();
    expect(data.study.flashcardReviews).toHaveLength(1);
    expect(data.clubs.memberships).toEqual([expect.objectContaining({ org: { name: "Club test" }, fees: [expect.objectContaining({ amountCents: 2000 })] })]);
    expect(await prisma.orgMember.count({ where: { userId: to } })).toBe(0);
    const [plan, recipe, supp] = await Promise.all([prisma.mealPlanEntry.findFirstOrThrow({ where: { userId: to } }), prisma.recipe.findFirstOrThrow({ where: { userId: to } }), prisma.supplement.findFirstOrThrow({ where: { userId: to }, include: { logs: true } })]);
    expect(plan.recipeId).toBe(recipe.id);
    expect(supp).toMatchObject({ days: [1, 3, 5], logs: [expect.objectContaining({ supplementId: supp.id })] });
    expect(data.security.passkeys).toEqual([]);
    expect(data.recovery.wellbeing).toEqual([expect.objectContaining({ kind: "MOOD", mood: 4 })]);
    // v2.1: la descripción vuelve, el vídeo no; la disciplina de la pista se conserva; lo compartido no se recrea
    const ex = await prisma.exercise.findFirstOrThrow({ where: { userId: to, name: "Salto con vallas" } });
    expect(ex).toMatchObject({ description: "Vallas bajas", videoPath: null, videoMime: null, videoBytes: null });
    expect(await prisma.trainingSession.findFirstOrThrow({ where: { userId: to, type: "TRACK" } })).toMatchObject({ discipline: "SPRINT" });
    expect(data.training21.referenceCurves).toHaveLength(1);
    expect(data.training21.physioProtocols).toHaveLength(1);
    expect(await prisma.physioProtocol.count({ where: { ownerId: to } })).toBe(0);
    await expect(restoreExport(to, data)).rejects.toThrow(/cuenta vacía/);
    await expect(restoreExport(to, { format: "otro" })).rejects.toThrow(/lifeos-export/);
  });

  it("una exportación v2.0 (sin campos de la v2.1) se restaura sin error", async () => {
    const { exportAccount } = await import("./service");
    const { restoreExport } = await import("./restore");
    const t = Date.now();
    const [a, b] = await Promise.all([prisma.user.create({ data: { email: `rs3-${t}@test.dev` } }), prisma.user.create({ data: { email: `rs4-${t}@test.dev` } })]);
    try {
      const { createTrainingSession } = await import("@/lib/training/service");
      await createTrainingSession(a.id, null, { date: "2026-10-01", type: "TECHNICAL", status: "COMPLETED", sessionRpe: 6, durationSec: 3600, technical: { event: "JAVELIN", implementWeightG: 800, isCompetition: false, attempts: [{ markM: 40, isFoul: false, isMeasured: true }] } } as never);
      const data = JSON.parse(JSON.stringify(await exportAccount(a.id)));
      delete data.training21;
      for (const e of data.training?.customExercises ?? []) { delete e.description; delete e.videoPath; delete e.videoMime; delete e.videoBytes; }
      const r = await restoreExport(b.id, data);
      expect(r.counts).toMatchObject({ sesiones: 1 });
    } finally {
      await prisma.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    }
  });

  it("el registro sin conexión no duplica la sesión si se reenvía", async () => {
    const { createTrainingSession } = await import("@/lib/training/service");
    const input = { date: "2026-10-02", type: "STRENGTH", status: "COMPLETED", clientId: "abc12345-offline", strength: { sets: [] } } as never;
    const a = await createTrainingSession(to, null, input);
    const b = await createTrainingSession(to, null, input);
    expect(b.id).toBe(a.id);
    expect(await prisma.trainingSession.count({ where: { userId: to, clientId: "abc12345-offline" } })).toBe(1);
  });
});
