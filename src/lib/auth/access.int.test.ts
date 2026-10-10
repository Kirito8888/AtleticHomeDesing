// Integración con BD real (v1.9): invitaciones de un solo uso, condiciones, suspensión y contraseña nueva sin email.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: async () => null }));

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("acceso solo con permiso v1.9 (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let access: typeof import("./access");
  let adminId: string;
  let userId: string;
  const t = Date.now();

  beforeAll(async () => {
    vi.resetModules();
    prisma = (await import("@/lib/prisma")).prisma;
    access = await import("./access");
    adminId = (await prisma.user.create({ data: { email: `adm-${t}@test.dev`, role: "ADMIN" } })).id;
    userId = (await prisma.user.create({ data: { email: `usr-${t}@test.dev`, passwordHash: "x" } })).id;
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { contains: `-${t}@test.dev` } } });
  });

  it("invitación: enlace de un solo uso, ligada al email si lo tiene, y sin el token en la BD", async () => {
    const inv = await access.createInvitation(adminId, { email: `nueva-${t}@test.dev`, role: "COACH", days: 7 });
    const token = new URL(inv.url, "http://x").searchParams.get("invite")!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const row = await prisma.invitation.findUniqueOrThrow({ where: { id: inv.id } });
    expect(row.tokenHash).not.toContain(token);
    expect(await access.findInvitation(token)).toMatchObject({ id: inv.id, role: "COACH", email: `nueva-${t}@test.dev` });
    expect(await access.findInvitation("x".repeat(43))).toBeNull();
    // Ya usada → deja de valer
    await prisma.invitation.update({ where: { id: inv.id }, data: { usedAt: new Date() } });
    expect(await access.findInvitation(token)).toBeNull();
    // Caducada → tampoco
    const old = await access.createInvitation(adminId, { email: null, role: "ATHLETE", days: 1 });
    await prisma.invitation.update({ where: { id: old.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await access.findInvitation(new URL(old.url, "http://x").searchParams.get("invite"))).toBeNull();
    // No se invita a un email que ya tiene cuenta
    await expect(access.createInvitation(adminId, { email: `usr-${t}@test.dev`, role: "ATHLETE", days: 7 })).rejects.toThrow(/Ya hay una cuenta/);
  });

  it("condiciones: hay que aceptar la versión vigente", async () => {
    expect(await access.hasAcceptedTerms(userId)).toBe(false);
    await prisma.consent.create({ data: { userId, purpose: "TERMS", version: "2020-01", granted: true } });
    expect(await access.hasAcceptedTerms(userId)).toBe(false);
    await access.acceptTerms(userId);
    expect(await access.hasAcceptedTerms(userId)).toBe(true);
  });

  it("suspender: corta las sesiones (sube la versión) y se puede reactivar; nunca a uno mismo", async () => {
    const before = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).sessionVersion;
    await access.suspendUser(adminId, userId);
    const s = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(s.suspendedAt).not.toBeNull();
    expect(s.sessionVersion).toBe(before + 1);
    await access.reactivateUser(adminId, userId);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).suspendedAt).toBeNull();
    await expect(access.suspendUser(adminId, adminId)).rejects.toThrow(/propia cuenta/);
  });

  it("contraseña nueva: enlace de 1 h y un solo uso; el anterior deja de valer", async () => {
    const first = await access.issuePasswordReset(adminId, userId);
    const second = await access.issuePasswordReset(adminId, userId);
    const tok = (u: string) => new URL(u, "http://x").searchParams.get("token")!;
    expect(await access.findPasswordReset(tok(first.url))).toBeNull();
    const v0 = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).sessionVersion;
    await access.resetPassword(tok(second.url), "contraseña-nueva-segura");
    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.passwordHash).not.toBe("x");
    expect(u.sessionVersion).toBe(v0 + 1);
    await expect(access.resetPassword(tok(second.url), "otra-contraseña-segura")).rejects.toThrow(/no es válido/);
  });
});
