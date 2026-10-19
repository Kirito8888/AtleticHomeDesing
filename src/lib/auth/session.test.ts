import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: async () => null }));

const db = vi.hoisted(() => ({
  link: null as unknown,
  members: [] as unknown[],
  restricted: null as Date | null,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    coachAthlete: { findUnique: async () => db.link },
    orgMember: { findMany: async () => db.members },
    user: { findUnique: async () => ({ processingRestrictedAt: db.restricted }) },
  },
}));

import { mergeGrants, resolveAthleteId } from "./session";

const coach = { id: "c1", role: "COACH" as const };
const ALL = ["LOAD", "SESSIONS", "RECOVERY", "PLANNING", "REPORTS"] as const;

beforeEach(() => {
  db.link = null;
  db.members = [];
  db.restricted = null;
});

describe("resolveAthleteId · permisos", () => {
  it("el propio usuario pasa sin consultar", async () => {
    expect(await resolveAthleteId(coach, undefined, "LOAD")).toBe("c1");
    expect(await resolveAthleteId(coach, "c1", "LOAD")).toBe("c1");
  });

  it("el ADMIN global no se salta el vínculo ni el ámbito", async () => {
    const admin = { id: "a", role: "ADMIN" as const };
    await expect(resolveAthleteId(admin, "x", "LOAD")).rejects.toThrow(/Sin vínculo activo/);
    db.link = { status: "ACTIVE", scopes: ["LOAD"], canPlan: false };
    expect(await resolveAthleteId(admin, "x", "LOAD")).toBe("x");
    await expect(resolveAthleteId(admin, "x", "RECOVERY")).rejects.toThrow(/no te ha dado acceso/);
    db.restricted = new Date();
    await expect(resolveAthleteId(admin, "x", "LOAD")).rejects.toThrow(/limitado el tratamiento/);
  });

  it("una atleta no accede a otra", async () => {
    await expect(resolveAthleteId({ id: "a1", role: "ATHLETE" }, "a2", "LOAD")).rejects.toThrow(/Sin permiso/);
  });

  it("sin vínculo ni club → 403", async () => {
    await expect(resolveAthleteId(coach, "a1", "LOAD")).rejects.toThrow(/Sin vínculo activo/);
  });

  it("vínculo 1:1 PENDING no vale", async () => {
    db.link = { status: "PENDING", scopes: [...ALL], canPlan: true };
    await expect(resolveAthleteId(coach, "a1", "LOAD")).rejects.toThrow(/Sin vínculo activo/);
  });

  it("club: la membresía ACTIVE de la atleta con staff activo da lectura de los ámbitos concedidos", async () => {
    db.members = [{ scopes: ["SESSIONS", "RECOVERY"], canPlan: false }];
    expect(await resolveAthleteId(coach, "a1", "RECOVERY")).toBe("a1");
    await expect(resolveAthleteId(coach, "a1", "LOAD")).rejects.toThrow(/no te ha dado acceso/);
  });

  it("club: escribir exige canPlan", async () => {
    db.members = [{ scopes: [...ALL], canPlan: false }];
    await expect(resolveAthleteId(coach, "a1", "PLANNING", "write")).rejects.toThrow(/planificación/);
    db.members = [{ scopes: [...ALL], canPlan: true }];
    expect(await resolveAthleteId(coach, "a1", "PLANNING", "write")).toBe("a1");
  });

  it("une vínculo 1:1 y club: un ámbito vale si alguna vía lo da", async () => {
    db.link = { status: "ACTIVE", scopes: ["LOAD"], canPlan: false };
    db.members = [{ scopes: ["SESSIONS"], canPlan: true }];
    expect(await resolveAthleteId(coach, "a1", "LOAD")).toBe("a1");
    expect(await resolveAthleteId(coach, "a1", "SESSIONS", "write")).toBe("a1");
  });

  it("RGPD art. 18: la limitación bloquea aunque haya vínculo y club con todos los permisos", async () => {
    db.link = { status: "ACTIVE", scopes: [...ALL], canPlan: true };
    db.members = [{ scopes: [...ALL], canPlan: true }];
    db.restricted = new Date();
    await expect(resolveAthleteId(coach, "a1", "LOAD")).rejects.toThrow(/limitado el tratamiento/);
    await expect(resolveAthleteId(coach, "a1", "PLANNING", "write")).rejects.toThrow(/limitado el tratamiento/);
  });

  it("mergeGrants", () => {
    expect(mergeGrants([{ scopes: ["LOAD"], canPlan: false }, { scopes: ["LOAD", "REPORTS"], canPlan: true }])).toEqual({
      scopes: ["LOAD", "REPORTS"],
      canPlan: true,
    });
  });
});
