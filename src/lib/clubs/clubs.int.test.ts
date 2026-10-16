// Integración con BD real (v2.0 A): clubes, consentimiento de la atleta, permisos y cuotas.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: async () => null }));

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("clubes y cuotas v2.0 (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("./service");
  let session: typeof import("@/lib/auth/session");
  let panel: typeof import("./club-panel");
  const t = Date.now();
  const u: Record<string, { id: string; role: "ATHLETE" | "COACH" | "ADMIN" }> = {};
  let orgId: string;
  const mail = (k: string) => `${k}-${t}@test.dev`;

  beforeAll(async () => {
    vi.resetModules();
    prisma = (await import("@/lib/prisma")).prisma;
    svc = await import("./service");
    session = await import("@/lib/auth/session");
    panel = await import("./club-panel");
    for (const [k, role] of [["adm", "COACH"], ["coa", "COACH"], ["at1", "ATHLETE"], ["at2", "ATHLETE"]] as const) {
      u[k] = { id: (await prisma.user.create({ data: { email: mail(k), role, passwordHash: "x" } })).id, role };
    }
  });
  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await prisma.user.deleteMany({ where: { email: { contains: `-${t}@test.dev` } } });
  });

  it("crear club, invitar y aceptar; una atleta puede estar en varios clubes", async () => {
    await expect(svc.createOrg(u.at1, "No")).rejects.toThrow(/entrenadora/);
    orgId = (await svc.createOrg(u.adm, "Club test")).id;
    const coa = await svc.inviteMember(u.adm, orgId, mail("coa"), "COACH");
    const a1 = await svc.inviteMember(u.adm, orgId, mail("at1"), "ATHLETE");
    await svc.inviteMember(u.adm, orgId, mail("at2"), "ATHLETE");
    // Una atleta no puede ser staff; email inexistente → mismo error
    await expect(svc.inviteMember(u.adm, orgId, mail("at1"), "COACH")).rejects.toThrow(/No se pudo/);
    await expect(svc.inviteMember(u.adm, orgId, "nadie@test.dev", "ATHLETE")).rejects.toThrow(/No se pudo/);
    // Solo la ADMIN invita
    await svc.updateMember(u.coa, orgId, coa.id, { status: "ACTIVE" });
    await expect(svc.inviteMember(u.coa, orgId, mail("at2"), "ATHLETE")).rejects.toThrow(/no encontrado/i);
    // Aceptar: solo la propia persona
    await expect(svc.updateMember(u.adm, orgId, a1.id, { status: "ACTIVE" })).rejects.toThrow(/propia persona/);
    await svc.updateMember(u.at1, orgId, a1.id, { status: "ACTIVE", scopes: ["SESSIONS", "PLANNING"], canPlan: false });
    // v2.2 · la aceptación y los ámbitos quedan en la Actividad de la atleta
    const ev = await prisma.securityEvent.findMany({ where: { userId: u.at1.id, type: "COACH_SCOPES_CHANGED" } });
    expect(ev).toHaveLength(1);
    expect(ev[0].detail).toMatch(/^Club «.*» · invitación aceptada · ámbitos: .*SESSIONS.* · planificar: no$/);
    const at2 = await prisma.orgMember.findFirstOrThrow({ where: { orgId, userId: u.at2.id } });
    await svc.updateMember(u.at2, orgId, at2.id, { status: "ACTIVE" });
    const second = (await svc.createOrg(u.adm, "Otro club")).id;
    await svc.inviteMember(u.adm, second, mail("at1"), "ATHLETE");
    expect(await prisma.orgMember.count({ where: { userId: u.at1.id } })).toBe(2);
    await prisma.organization.delete({ where: { id: second } });
  });

  it("permisos: PENDING no da acceso; ACTIVE da solo lo concedido; la restricción RGPD bloquea", async () => {
    const coa = { ...u.coa };
    // at1 aceptó SESSIONS+PLANNING; at2 aceptó con todo
    expect(await session.resolveAthleteId(coa, u.at1.id, "SESSIONS")).toBe(u.at1.id);
    await expect(session.resolveAthleteId(coa, u.at1.id, "RECOVERY")).rejects.toThrow(/no te ha dado acceso/);
    await expect(session.resolveAthleteId(coa, u.at1.id, "PLANNING", "write")).rejects.toThrow(/planificación/);
    await prisma.user.update({ where: { id: u.at2.id }, data: { processingRestrictedAt: new Date() } });
    await expect(session.resolveAthleteId(coa, u.at2.id, "SESSIONS")).rejects.toThrow(/limitado el tratamiento/);
    // El panel solo muestra a at1 con datos; at2 (restringida) sale sin datos
    const p = await panel.loadClubPanel(coa, orgId);
    expect(p.compare.find((r) => r.id === u.at2.id)).toMatchObject({ load7: null, compliancePct: null });
    expect(p.hidden).toBeGreaterThan(0);
    await prisma.user.update({ where: { id: u.at2.id }, data: { processingRestrictedAt: null } });
    // Una atleta ajena al club no es accesible
    await expect(session.resolveAthleteId(coa, u.adm.id, "LOAD")).rejects.toThrow(/Sin vínculo/);
  });

  it("cuotas: solo la ADMIN apunta y marca; la entrenadora no las ve; la atleta ve las suyas", async () => {
    const m1 = await prisma.orgMember.findFirstOrThrow({ where: { orgId, userId: u.at1.id } });
    await expect(svc.recordFee(u.coa, orgId, { memberId: m1.id, concept: "Cuota", amount: "30", dueDate: "2026-10-31" })).rejects.toThrow(/no encontrado/i);
    const fee = await svc.recordFee(u.adm, orgId, { memberId: m1.id, concept: "Cuota octubre", amount: "30,50", dueDate: "2026-10-31" });
    expect(fee).toMatchObject({ amountCents: 3050, status: "PENDING" });
    await svc.recordFee(u.adm, orgId, { memberId: (await prisma.orgMember.findFirstOrThrow({ where: { orgId, userId: u.at2.id } })).id, concept: "Otra", amount: "10", dueDate: "2026-10-31" });
    expect((await svc.listFees(u.adm, orgId)).length).toBe(2);
    expect(await svc.listFees(u.coa, orgId)).toEqual([]);
    expect((await svc.listFees(u.at1, orgId)).map((f) => f.id)).toEqual([fee.id]);
    await expect(svc.setFeeStatus(u.at1, orgId, fee.id, "PAID")).rejects.toThrow(/no encontrado/i);
    const paid = await svc.setFeeStatus(u.adm, orgId, fee.id, "PAID", "2026-10-14");
    expect(paid.status).toBe("PAID");
    expect((await prisma.orgFee.findUniqueOrThrow({ where: { id: fee.id } })).paidAt?.toISOString().slice(0, 10)).toBe("2026-10-14");
    await expect(svc.recordFee(u.adm, orgId, { memberId: m1.id, concept: "x", amount: "0", dueDate: "2026-10-31" })).rejects.toThrow(/Importe/);
  });

  it("salir del club deja huella en la Actividad de la propia persona", async () => {
    const m = await prisma.orgMember.findFirstOrThrow({ where: { orgId, userId: u.at2.id } });
    await svc.removeMember(u.at2, orgId, m.id);
    const ev = await prisma.securityEvent.findMany({ where: { userId: u.at2.id, type: "COACH_SCOPES_CHANGED" }, orderBy: { createdAt: "desc" } });
    expect(ev[0].detail).toMatch(/has salido del club$/);
  });

  it("no se puede dejar el club sin administradora", async () => {
    const adm = await prisma.orgMember.findFirstOrThrow({ where: { orgId, userId: u.adm.id } });
    await expect(svc.removeMember(u.adm, orgId, adm.id)).rejects.toThrow(/administradora/);
  });
});
