// Integración con BD real: asignaturas con fecha de examen, temas, apuntes y ruta priorizada.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("asignaturas de estudio (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("./modules-service");
  let userId: string;
  let otherId: string;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    svc = await import("./modules-service");
    userId = (await prisma.user.create({ data: { email: `mod-${Date.now()}@test.dev` } })).id;
    otherId = (await prisma.user.create({ data: { email: `mod2-${Date.now()}@test.dev` } })).id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
  });

  it("crea la asignatura con fecha, rechaza duplicados y calcula los días", async () => {
    const m = await svc.createModule(userId, { name: "Bioquímica", examDate: "2026-11-24" });
    await expect(svc.createModule(userId, { name: "Bioquímica" })).rejects.toMatchObject({ status: 409 });
    const list = await svc.listModules(userId, "2026-10-25");
    expect(list).toMatchObject([{ id: m.id, name: "Bioquímica", examDate: "2026-11-24", daysLeft: 30, topics: 0 }]);
  });

  it("reordena por prioridad según los días, sin perder temas", async () => {
    const m = await svc.createModule(userId, { name: "Anatomía", examDate: "2026-10-26" });
    await svc.addTopic(userId, m.id, { name: "Grisáceo", tag: "grey", minutes: 20 });
    await svc.addTopic(userId, m.id, { name: "Largo seguro", tag: "red", minutes: 600 });
    await svc.addTopic(userId, m.id, { name: "Corto seguro", tag: "red", minutes: 30 });
    expect((await svc.moduleView(userId, m.id, "2026-10-25")).route).toBeNull(); // sin modo preparación
    await svc.updateModule(userId, m.id, { prepMode: true });
    const one = await svc.moduleView(userId, m.id, "2026-10-25");
    expect(one.route!.map((t) => t.name)).toEqual(["Corto seguro", "Grisáceo", "Largo seguro"]);
    expect(one.route!.at(-1)!.overflow).toBe(true);
    await svc.updateModule(userId, m.id, { examDate: "2026-12-31" });
    const far = await svc.moduleView(userId, m.id, "2026-10-25");
    expect(far.route!.map((t) => t.name)).toEqual(["Corto seguro", "Largo seguro", "Grisáceo"]);
    expect(far.route!.some((t) => t.overflow)).toBe(false);
    expect(far.topics).toHaveLength(3);
  });

  it("asigna un apunte (crea su tema) y al borrar la asignatura el apunte se conserva", async () => {
    const m = await svc.createModule(userId, { name: "Química" });
    const doc = await prisma.studyDocument.create({ data: { userId, title: "Tema 1", mimeType: "text/plain", storagePath: "", sizeBytes: 1 } });
    await svc.assignDocument(userId, doc.id, m.id);
    await svc.assignDocument(userId, doc.id, m.id); // idempotente
    const v = await svc.moduleView(userId, m.id, "2026-10-25");
    expect(v.documents.map((d) => d.id)).toEqual([doc.id]);
    expect(v.topics).toHaveLength(1);
    expect((await prisma.studyDocument.findUniqueOrThrow({ where: { id: doc.id } })).subject).toBe("Química");
    await svc.deleteModule(userId, m.id);
    expect(await prisma.studyTopic.count({ where: { moduleId: m.id } })).toBe(0);
    expect((await prisma.studyDocument.findUniqueOrThrow({ where: { id: doc.id } })).moduleId).toBeNull();
  });

  it("aisla a las usuarias entre sí", async () => {
    const m = await svc.createModule(userId, { name: "Privada" });
    const t = await svc.addTopic(userId, m.id, { name: "x", tag: "red", minutes: 30 });
    const doc = await prisma.studyDocument.create({ data: { userId: otherId, title: "Ajeno", mimeType: "text/plain", storagePath: "", sizeBytes: 1 } });
    await expect(svc.moduleView(otherId, m.id, "2026-10-25")).rejects.toMatchObject({ status: 404 });
    await expect(svc.updateModule(otherId, m.id, { prepMode: true })).rejects.toMatchObject({ status: 404 });
    await expect(svc.addTopic(otherId, m.id, { name: "y", tag: "red", minutes: 30 })).rejects.toMatchObject({ status: 404 });
    await expect(svc.updateTopic(otherId, t.id, { done: true })).rejects.toMatchObject({ status: 404 });
    await expect(svc.assignDocument(otherId, doc.id, m.id)).rejects.toMatchObject({ status: 404 });
    await expect(svc.assignDocument(userId, doc.id, m.id)).rejects.toMatchObject({ status: 404 });
    await expect(svc.deleteModule(otherId, m.id)).rejects.toMatchObject({ status: 404 });
  });
});
