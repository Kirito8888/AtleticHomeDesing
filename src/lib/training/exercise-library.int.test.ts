// Integración con BD real (v2.1 bloque 2): biblioteca de ejercicios con instrucciones y vídeo cifrado.
import { randomBytes } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: async () => null }));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const mp4 = (n = 64) => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(n, 7)]);

describe.skipIf(!HAS_DB)("biblioteca de ejercicios v2.1 (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let lib: typeof import("./exercise-library");
  let a: string;
  let b: string;
  let coach: string;
  let dir: string;
  let exId: string;
  let globalId: string;
  const saved = { ...process.env };

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "lifeos-exlib-"));
    process.env.UPLOAD_DIR = dir;
    process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    process.env.LIFEOS_NO_WEATHER = "1";
    vi.resetModules();
    prisma = (await import("@/lib/prisma")).prisma;
    lib = await import("./exercise-library");
    const t = Date.now();
    a = (await prisma.user.create({ data: { email: `ex1-${t}@test.dev`, athleteProfile: { create: {} } } })).id;
    b = (await prisma.user.create({ data: { email: `ex2-${t}@test.dev` } })).id;
    coach = (await prisma.user.create({ data: { email: `ex3-${t}@test.dev`, role: "COACH" } })).id;
    globalId = (await prisma.exercise.create({ data: { name: `Global ${t}`, userId: null } })).id;
    exId = (await prisma.exercise.create({ data: { name: `Mío ${t}`, userId: a, description: "Cadera atrás." } })).id;
  });
  afterAll(async () => {
    const { purgeUser } = await import("@/lib/account/service");
    await prisma.exercise.delete({ where: { id: globalId } }).catch(() => null);
    for (const id of [a, b, coach]) await purgeUser(id);
    process.env = saved;
    await rm(dir, { recursive: true, force: true });
  });

  it("lista global + propios sin exponer la ruta; el ajeno no se ve", async () => {
    const mine = await lib.listLibrary(a);
    expect(mine.map((e) => e.id)).toEqual(expect.arrayContaining([globalId, exId]));
    expect(JSON.stringify(mine)).not.toContain("videoPath");
    expect((await lib.listLibrary(b)).some((e) => e.id === exId)).toBe(false);
    await expect(lib.getExercise(b, exId)).rejects.toMatchObject({ status: 404 });
  });

  it("edita lo propio; global → 403; ajeno → 404; nombre repetido → 409", async () => {
    expect((await lib.updateExercise(a, exId, { description: "Nueva" })).description).toBe("Nueva");
    await expect(lib.updateExercise(a, globalId, { description: "x" })).rejects.toMatchObject({ status: 403 });
    await expect(lib.updateExercise(b, exId, { description: "x" })).rejects.toMatchObject({ status: 404 });
    const other = await prisma.exercise.create({ data: { name: "Otro", userId: a } });
    await expect(lib.updateExercise(a, other.id, { name: (await lib.getExercise(a, exId)).name })).rejects.toMatchObject({ status: 409 });
  });

  it("vídeo: sube, descifra igual, en disco va cifrado, reemplaza (borra el anterior) y borra", async () => {
    const clip = mp4();
    const ex = await lib.setExerciseVideo(a, exId, clip);
    expect(ex).toMatchObject({ hasVideo: true, videoMime: "video/mp4", videoBytes: clip.length });
    const { bytes, mime } = await lib.readExerciseVideo(a, exId);
    expect(mime).toBe("video/mp4");
    expect(bytes.equals(clip)).toBe(true);
    const files = await readdir(path.join(dir, a, "exercises"));
    expect(files).toHaveLength(1);
    await lib.setExerciseVideo(a, exId, mp4(200));
    expect(await readdir(path.join(dir, a, "exercises"))).toHaveLength(1); // el clip anterior se fue
    await lib.deleteExerciseVideo(a, exId);
    expect(await readdir(path.join(dir, a, "exercises"))).toHaveLength(0);
    await expect(lib.readExerciseVideo(a, exId)).rejects.toMatchObject({ status: 404 });
  });

  it("vídeo: rechaza tipo y tamaño, y nunca en global ni ajeno", async () => {
    await expect(lib.setExerciseVideo(a, exId, Buffer.from("no soy un vídeo"))).rejects.toMatchObject({ status: 415 });
    const big = Buffer.alloc(25 * 1024 * 1024 + 1);
    mp4().copy(big);
    await expect(lib.setExerciseVideo(a, exId, big)).rejects.toMatchObject({ status: 413 });
    await expect(lib.setExerciseVideo(a, globalId, mp4())).rejects.toMatchObject({ status: 403 });
    await expect(lib.setExerciseVideo(b, exId, mp4())).rejects.toMatchObject({ status: 404 });
    expect((await lib.getExercise(a, exId)).hasVideo).toBe(false);
  });

  it("borra un ejercicio propio con su clip; global 403, ajeno 404, con series 409", async () => {
    const mine = await prisma.exercise.create({ data: { name: `Borrar ${Date.now()}`, userId: a } });
    await lib.setExerciseVideo(a, mine.id, mp4());
    const before = (await readdir(path.join(dir, a, "exercises"))).length;
    await expect(lib.deleteExercise(a, globalId)).rejects.toMatchObject({ status: 403 });
    await expect(lib.deleteExercise(b, mine.id)).rejects.toMatchObject({ status: 404 });
    await lib.deleteExercise(a, mine.id);
    expect(await prisma.exercise.findUnique({ where: { id: mine.id } })).toBeNull();
    expect((await readdir(path.join(dir, a, "exercises"))).length).toBe(before - 1);
    const used = await prisma.exercise.create({ data: { name: `Usado ${Date.now()}`, userId: a } });
    const ts = await prisma.trainingSession.create({ data: { userId: a, date: new Date(), type: "STRENGTH", status: "COMPLETED", strength: { create: {} } }, include: { strength: true } });
    await prisma.strengthSet.create({ data: { strengthSessionId: ts.strength!.id, exerciseId: used.id, order: 1, setIndex: 1, reps: 5 } });
    await expect(lib.deleteExercise(a, used.id)).rejects.toMatchObject({ status: 409 });
  });

  it("la entrenadora lee vía resolveAthleteId solo con vínculo activo y ámbito SESSIONS", async () => {
    const { resolveAthleteId } = await import("@/lib/auth/session");
    const user = { id: coach, role: "COACH" } as never;
    await expect(resolveAthleteId(user, a, "SESSIONS")).rejects.toMatchObject({ status: 403 });
    await prisma.coachAthlete.create({ data: { coachId: coach, athleteId: a, status: "ACTIVE", scopes: ["LOAD"] } });
    await expect(resolveAthleteId(user, a, "SESSIONS")).rejects.toBeTruthy();
    await prisma.coachAthlete.update({ where: { coachId_athleteId: { coachId: coach, athleteId: a } }, data: { scopes: ["SESSIONS"] } });
    const owner = await resolveAthleteId(user, a, "SESSIONS");
    expect(owner).toBe(a);
    await lib.setExerciseVideo(a, exId, mp4());
    expect((await lib.readExerciseVideo(owner, exId)).bytes.length).toBe(mp4().length);
    // …pero editar sigue siendo solo de la dueña
    await expect(lib.setExerciseVideo(coach, exId, mp4())).rejects.toMatchObject({ status: 404 });
  });
});
