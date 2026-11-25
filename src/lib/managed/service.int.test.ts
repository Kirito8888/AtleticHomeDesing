// Integración con BD real (v3.3 E1): fichas gestionadas (atletas sin cuenta) sin acceso y fuera de los barridos.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { testStamp } from "@/test/stamp";

vi.mock("@/auth", () => ({ auth: async () => null }));

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("fichas gestionadas (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("./service");
  let access: typeof import("@/lib/auth/access");
  const t = testStamp();
  let coach: { id: string; role: string };
  let admin: { id: string; role: string };
  let athlete: { id: string; role: string };
  const ids: string[] = [];
  const base = { alias: `Atleta ${t}`, category: "Sub-18", consent: true as const };

  beforeAll(async () => {
    vi.resetModules();
    prisma = (await import("@/lib/prisma")).prisma;
    svc = await import("./service");
    access = await import("@/lib/auth/access");
    const mk = async (k: string, role: "ATHLETE" | "COACH" | "ADMIN") => {
      const u = await prisma.user.create({ data: { email: `mg-${k}-${t}@test.dev`, role, passwordHash: "x" } });
      ids.push(u.id);
      return { id: u.id, role };
    };
    coach = await mk("coach", "COACH");
    admin = await mk("admin", "ADMIN");
    athlete = await mk("ath", "ATHLETE");
  });

  afterAll(async () => {
    await prisma.managedAthlete.deleteMany({ where: { coachId: { in: ids } } });
    await prisma.user.deleteMany({ where: { managedById: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  });

  it("crea una ficha sin contraseña, sin cuentas ni llaves y con email que no enruta", async () => {
    const f = await svc.createManagedAthlete(coach, base);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: f.userId }, include: { accounts: true, passkeys: true, managedProfile: true } });
    expect(u.managedById).toBe(coach.id);
    expect(u.passwordHash).toBeNull();
    expect(u.totpSecret).toBeNull();
    expect(u.accounts).toHaveLength(0);
    expect(u.passkeys).toHaveLength(0);
    expect(u.email.endsWith("@fichas.invalid")).toBe(true);
    expect(u.name).toBe(base.alias);
    expect(u.managedProfile?.consentAt).toBeInstanceOf(Date);
    expect(await svc.isManagedUser(u.id)).toBe(true);
    expect(await svc.isManagedUser(coach.id)).toBe(false);
  });

  it("solo COACH o ADMIN crea fichas; exige conformidad, año o categoría y edad mínima", async () => {
    await expect(svc.createManagedAthlete(athlete, base)).rejects.toMatchObject({ status: 403 });
    await expect(svc.createManagedAthlete(admin, base)).resolves.toBeTruthy();
    await expect(svc.createManagedAthlete(coach, { ...base, consent: false })).rejects.toMatchObject({ status: 400 });
    await expect(svc.createManagedAthlete(coach, { alias: "X", consent: true })).rejects.toMatchObject({ status: 400 });
    const young = new Date().getUTCFullYear() - 13;
    await expect(svc.createManagedAthlete(coach, { alias: "Joven", birthYear: young, consent: true })).rejects.toMatchObject({ status: 400 });
    await expect(svc.createManagedAthlete(coach, { alias: "Ok", birthYear: new Date().getUTCFullYear() - 16, consent: true })).resolves.toBeTruthy();
    await expect(svc.createManagedAthlete(coach, { ...base, name: "Nombre Real" })).rejects.toMatchObject({ status: 400 });
  });

  it("la administración no la trata como cuenta: ni la lista, ni la suspende, ni le emite restablecimientos", async () => {
    const f = await svc.createManagedAthlete(coach, base);
    const listed = (await access.listUsersForAdmin()).map((x) => x.id);
    expect(listed).toContain(coach.id);
    expect(listed).not.toContain(f.userId);
    await expect(access.issuePasswordReset(admin.id, f.userId)).rejects.toMatchObject({ status: 404 });
    await expect(access.suspendUser(admin.id, f.userId)).rejects.toMatchObject({ status: 404 });
    expect(await prisma.passwordReset.count({ where: { userId: f.userId } })).toBe(0);
  });

  it("no se borra la entrenadora con fichas a su cargo (Restrict)", async () => {
    await svc.createManagedAthlete(coach, base);
    await expect(prisma.user.delete({ where: { id: coach.id } })).rejects.toBeTruthy();
  });
});
