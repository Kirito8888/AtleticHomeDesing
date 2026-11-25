// Integración con BD real (v3.2 N): exportación guiada por módulos, lo cifrado solo si se pide y nada de terceros.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AUTHORSHIP_NOTICE } from "@/lib/legal/notice";

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("exportación guiada (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let me: string;
  let coach: string;
  const t = Date.now();
  const coachEmail = `ex-coach-${t}@test.dev`;
  const coachName = "Entrenadora Secreta";

  beforeAll(async () => {
    process.env.LIFEOS_NO_WEATHER = "1";
    prisma = (await import("@/lib/prisma")).prisma;
    me = (await prisma.user.create({ data: { email: `ex-me-${t}@test.dev` } })).id;
    coach = (await prisma.user.create({ data: { email: coachEmail, name: coachName } })).id;
    const { addWellbeing } = await import("@/lib/recovery/wellbeing-service");
    await addWellbeing(me, { kind: "MOOD", date: "2026-10-03", mood: 4, stress: 2 });
    await prisma.recipe.create({ data: { userId: me, name: "Arroz", servings: 2, items: [] } });
    await prisma.sessionComment.createMany({
      data: [
        { sessionId: "s1", athleteId: me, authorId: coach, body: "Texto privado de la entrenadora" },
        { sessionId: "s1", athleteId: me, authorId: me, body: "Mi respuesta" },
      ],
    });
    await prisma.coachAthlete.create({ data: { coachId: coach, athleteId: me, status: "ACTIVE" } });
    await prisma.safetyContact.create({ data: { userId: coach, contactId: me, status: "ACTIVE" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [me, coach].filter(Boolean) } } });
  });

  it("por defecto no saca lo cifrado, ni siquiera la clave, y lleva el pie de autoría", async () => {
    const { exportAccount } = await import("./service");
    const data = JSON.parse(JSON.stringify(await exportAccount(me)));
    expect(data.notice).toBe(AUTHORSHIP_NOTICE);
    expect(data.format).toBe("lifeos-export/2");
    expect(data.selection.sensitive).toBe(false);
    for (const k of ["wellbeing", "menstrualCycle", "womenHealth", "bodyComposition"]) expect(Object.keys(data.recovery)).not.toContain(k);
    expect(data.recovery.metrics).toBeDefined();
  });

  it("con lo cifrado pedido, sí sale", async () => {
    const { exportAccount } = await import("./service");
    const data = JSON.parse(JSON.stringify(await exportAccount(me, { sensitive: true })));
    expect(data.selection.sensitive).toBe(true);
    expect(data.recovery.wellbeing).toEqual([expect.objectContaining({ kind: "MOOD", mood: 4 })]);
  });

  it("solo los módulos elegidos; la cuenta va siempre", async () => {
    const { exportAccount } = await import("./service");
    const data = JSON.parse(JSON.stringify(await exportAccount(me, { modules: ["nutrition"] })));
    expect(data.nutrition.recipes).toHaveLength(1);
    for (const k of ["training", "recovery", "finance", "study", "coach", "clubs", "planning"]) expect(Object.keys(data)).not.toContain(k);
    for (const k of ["user", "security", "privacy", "app", "notice", "format"]) expect(Object.keys(data)).toContain(k);
  });

  it("lo cifrado sin el módulo de recuperación sale solo en `recovery` y sin lo demás", async () => {
    const { exportAccount } = await import("./service");
    const data = JSON.parse(JSON.stringify(await exportAccount(me, { modules: ["finance"], sensitive: true })));
    expect(Object.keys(data.recovery).sort()).toEqual(["bodyComposition", "menstrualCycle", "wellbeing", "womenHealth"]);
    expect(data.recovery.metrics).toBeUndefined();
    expect(Object.keys(data)).toContain("finance");
  });

  it("nada de otras personas: ni su correo, ni su nombre, ni su texto", async () => {
    const { exportAccount } = await import("./service");
    const json = JSON.stringify(await exportAccount(me, { sensitive: true }));
    expect(json).not.toContain(coachEmail);
    expect(json).not.toContain(coachName);
    expect(json).not.toContain("Texto privado de la entrenadora");
    expect(json).toContain("Mi respuesta");
    const data = JSON.parse(json);
    expect(data.training.comments).toHaveLength(2);
    expect(data.coach.links).toEqual([expect.objectContaining({ myRole: "ATHLETE" })]);
    expect(data.recovery.safety.contacts).toEqual([{ status: "ACTIVE", createdAt: expect.any(String), role: "I_AM_CONTACT" }]);
  });
});
