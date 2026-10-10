// Integración con BD real (v1.7): rotación de claves de cifrado y cadena de auditoría.
import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL);
const KEY_A = randomBytes(32).toString("base64");
const KEY_B = randomBytes(32).toString("base64");

describe.skipIf(!HAS_DB)("seguridad v1.7 (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let userId: string;
  const saved = { ...process.env };

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    userId = (await prisma.user.create({ data: { email: `sec17-${Date.now()}@test.dev` } })).id;
  });
  afterAll(async () => {
    process.env = saved;
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("rotación: lo cifrado con la clave vieja se lee durante la rotación y pasa a la nueva", async () => {
    const { seal } = await import("./secret-box");
    await prisma.cycleProfile.create({ data: { userId, data: seal(JSON.stringify({ avgLength: 29 }), KEY_A) } });
    await prisma.healthLog.create({ data: { userId, date: new Date("2026-10-01"), data: seal(JSON.stringify({ kind: "LAB" }), KEY_A) } });

    process.env.DATA_ENCRYPTION_KEY = KEY_B;
    process.env.DATA_ENCRYPTION_KEY_PREVIOUS = KEY_A;
    vi.resetModules();
    const dk = await import("./data-key");
    const row = await prisma.cycleProfile.findUniqueOrThrow({ where: { userId } });
    expect(dk.openJson<{ avgLength: number }>(row.data).avgLength).toBe(29);

    const { reencryptAll } = await import("./rotate");
    const r = await reencryptAll();
    // (la BD de pruebas tiene filas de otras claves: solo se comprueba que esta se recifró)
    expect(r["ciclo (ajustes)"].rotated).toBeGreaterThanOrEqual(1);

    // Ya sin la clave vieja
    delete process.env.DATA_ENCRYPTION_KEY_PREVIOUS;
    vi.resetModules();
    const dk2 = await import("./data-key");
    const after = await prisma.cycleProfile.findUniqueOrThrow({ where: { userId } });
    expect(dk2.openJson<{ avgLength: number }>(after.data).avgLength).toBe(29);
    const log = await prisma.healthLog.findFirstOrThrow({ where: { userId } });
    expect(dk2.openJson<{ kind: string }>(log.data).kind).toBe("LAB");
  });

  it("la cadena de auditoría detecta un evento modificado en la BD", async () => {
    process.env.AUTH_SECRET = "secreto-de-prueba-auditoria";
    vi.resetModules();
    const audit = await import("./audit");
    await audit.recordEvent(userId, "LOGIN_SUCCESS", { ip: "10.0.0.1" });
    await audit.recordEvent(userId, "PASSWORD_CHANGED", { ip: "10.0.0.1" });
    await audit.recordEvent(userId, "DATA_EXPORTED", { ip: "10.0.0.1" }, "JSON");
    expect(await audit.auditIntegrity(userId)).toEqual({ ok: true, checked: 3 });
    const mid = await prisma.securityEvent.findFirstOrThrow({ where: { userId, type: "PASSWORD_CHANGED" } });
    await prisma.securityEvent.update({ where: { id: mid.id }, data: { ip: "6.6.6.6" } });
    expect(await audit.auditIntegrity(userId)).toMatchObject({ ok: false, brokenAt: mid.id });
  });
});
