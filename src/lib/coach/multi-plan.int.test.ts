// Integración con BD real (v2.0 B): copiar a varios atletas solo a quienes tienen canPlan; la previsualización no escribe.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: async () => null }));

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("planificar varios atletas v2.0 (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("./multi-plan");
  const t = Date.now();
  const u: Record<string, string> = {};
  let tplId: string;
  const mail = (k: string) => `${k}-${t}@test.dev`;
  const coach = () => ({ id: u.coa, role: "COACH" as const });
  const input = (ids: string[]) => ({ source: { kind: "template" as const, id: tplId }, start: "2030-03-04", athleteIds: ids, rpe: 6 });
  const mine = () => ({ userId: { in: Object.values(u) } });
  const counts = async () => [await prisma.planMeso.count({ where: mine() }), await prisma.trainingSession.count({ where: mine() }), await prisma.dailyLoad.count({ where: mine() })];

  beforeAll(async () => {
    vi.resetModules();
    prisma = (await import("@/lib/prisma")).prisma;
    svc = await import("./multi-plan");
    for (const [k, role] of [["coa", "COACH"], ["plan", "ATHLETE"], ["noplan", "ATHLETE"], ["restr", "ATHLETE"], ["nolink", "ATHLETE"]] as const) {
      u[k] = (await prisma.user.create({ data: { email: mail(k), role, passwordHash: "x" } })).id;
    }
    const link = (k: string, canPlan: boolean) => prisma.coachAthlete.create({ data: { coachId: u.coa, athleteId: u[k], status: "ACTIVE", scopes: ["PLANNING", "LOAD"], canPlan } });
    await link("plan", true);
    await link("noplan", false);
    await link("restr", true);
    await prisma.user.update({ where: { id: u.restr }, data: { processingRestrictedAt: new Date() } });
    const days = [0, 2, 4].map((weekday) => ({ weekday, title: `Día ${weekday}`, durationMin: 60, type: "STRENGTH", content: [{ kind: "table", rows: [] }] }));
    tplId = (await prisma.weekTemplate.create({ data: { userId: u.coa, name: "Semana test", days } })).id;
    await prisma.dailyLoad.create({ data: { userId: u.plan, date: new Date("2030-03-01"), tss: 50, ctl: 50, atl: 60, tsb: -10 } });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { contains: `-${t}@test.dev` } } });
  });

  it("el resumen marca quién se puede planificar y por qué no", async () => {
    const o = await svc.multiPlanOverview(coach());
    const by = Object.fromEntries(o.athletes.map((a) => [a.id, a]));
    expect(by[u.plan].eligible).toBe(true);
    expect(by[u.noplan].reason).toMatch(/permiso de planificación/);
    expect(by[u.restr].reason).toMatch(/limitado/);
    expect(by[u.nolink]).toBeUndefined();
  });

  it("la previsualización no escribe nada y simula con la semilla de la atleta", async () => {
    const before = await counts();
    const r = await svc.previewAssignment(coach(), input([u.plan, u.noplan, u.restr, u.nolink]));
    expect(await counts()).toEqual(before);
    expect(r.athletes.map((a) => a.id)).toEqual([u.plan]);
    expect(r.rejected.map((x) => x.id).sort()).toEqual([u.noplan, u.restr, u.nolink].sort());
    const sims = r.athletes[0].simulation!.scenarios;
    expect(sims.map((s) => s.id)).toEqual(["base", "copy"]);
    expect(sims[1].summary.ctlEnd).toBeGreaterThan(sims[0].summary.ctlEnd);
    expect(r.athletes[0].days).toHaveLength(3);
  });

  it("asignar exige confirmación y solo crea borradores en quien tiene canPlan", async () => {
    await expect(async () => svc.applySchema.parse({ ...input([u.plan]) })).rejects.toThrow();
    const r = await svc.applyAssignment(coach(), svc.applySchema.parse({ ...input([u.plan, u.noplan, u.restr, u.nolink]), confirm: true }));
    expect(r.created.map((c) => c.athleteId)).toEqual([u.plan]);
    expect(r.rejected).toHaveLength(3);
    const drafts = await prisma.planMeso.findMany({ where: { userId: u.plan } });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ status: "DRAFT", source: "MANUAL" });
    expect(await prisma.planDay.count({ where: { mesoId: drafts[0].id } })).toBe(3);
    expect(await prisma.trainingSession.count({ where: { userId: u.plan } })).toBe(0);
    for (const k of ["noplan", "restr", "nolink"]) expect(await prisma.planMeso.count({ where: { userId: u[k] } })).toBe(0);
  });

  it("una atleta no puede usarlo", async () => {
    await expect(svc.multiPlanOverview({ id: u.plan, role: "ATHLETE" })).rejects.toThrow(/entrenadoras/);
  });
});
