// Integración con BD real: anotar un bloque de estudio del temporizador (idempotencia, módulo, plan).
import { beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL);
let prisma: typeof import("@/lib/prisma").prisma;
let logStudySession: typeof import("@/lib/study/study-session-service").logStudySession;

const D = "2030-03-04";
let uid = "";
let other = "";
let mod = "";
let foreign = "";

describe.skipIf(!HAS_DB)("logStudySession", () => {
  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    logStudySession = (await import("@/lib/study/study-session-service")).logStudySession;
    const mk = (email: string) => prisma.user.create({ data: { email, name: "t" }, select: { id: true } });
    const stamp = Date.now();
    uid = (await mk(`ss-a-${stamp}@test.local`)).id;
    other = (await mk(`ss-b-${stamp}@test.local`)).id;
    mod = (await prisma.studyModule.create({ data: { userId: uid, name: "Cálculo" }, select: { id: true } })).id;
    foreign = (await prisma.studyModule.create({ data: { userId: other, name: "Ajena" }, select: { id: true } })).id;
  });

  it("anota con módulo, resuelve por nombre y tacha el plan", async () => {
    await prisma.studyPlanBlock.create({ data: { userId: uid, subject: "Cálculo", date: new Date(`${D}T00:00:00Z`), minutes: 15 } });
    const a = await logStudySession(uid, { subject: "Cálculo", minutes: 15, date: D, moduleId: mod, clientKey: "k1" });
    expect(a.ticked).toBe(1);
    const b = await logStudySession(uid, { subject: "cálculo", minutes: 5, date: D });
    expect((await prisma.studySession.findUniqueOrThrow({ where: { id: b.id } })).moduleId).toBe(mod);
  });

  it("con la misma clave no duplica ni vuelve a tachar", async () => {
    const again = await logStudySession(uid, { subject: "Cálculo", minutes: 15, date: D, moduleId: mod, clientKey: "k1" });
    expect(again.duplicate).toBe(true);
    expect(again.ticked).toBe(0);
    expect(await prisma.studySession.count({ where: { userId: uid, clientKey: "k1" } })).toBe(1);
  });

  it("rechaza un módulo ajeno (404)", async () => {
    await expect(logStudySession(uid, { subject: "X", minutes: 5, date: D, moduleId: foreign })).rejects.toMatchObject({ status: 404 });
  });
});
