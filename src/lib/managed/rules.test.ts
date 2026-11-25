import { describe, expect, it } from "vitest";
import { ageOk, isManagedEmail, latestBirthYear, managedCreateSchema, managedEmail, MANAGED_EMAIL_DOMAIN } from "./rules";

describe("fichas gestionadas · reglas puras", () => {
  it("el email marcador no enruta y se reconoce", () => {
    const e = managedEmail("CkAbC123");
    expect(e).toBe(`ficha-ckabc123@${MANAGED_EMAIL_DOMAIN}`);
    expect(isManagedEmail(e)).toBe(true);
    expect(isManagedEmail("ana@correo.es")).toBe(false);
  });
  it("edad mínima 14 con solo el año de nacimiento", () => {
    expect(latestBirthYear(2026)).toBe(2011);
    expect(ageOk(2011, 2026)).toBe(true);
    expect(ageOk(2012, 2026)).toBe(false);
    expect(ageOk(undefined, 2026)).toBe(true);
  });
  it("exige alias, conformidad y año o categoría; rechaza campos de nombre, email o teléfono", () => {
    const ok = { alias: "Atleta A", category: "Sub-18", consent: true as const };
    expect(managedCreateSchema.safeParse(ok).success).toBe(true);
    expect(managedCreateSchema.safeParse({ ...ok, consent: false }).success).toBe(false);
    expect(managedCreateSchema.safeParse({ alias: "A", consent: true }).success).toBe(false);
    expect(managedCreateSchema.safeParse({ ...ok, email: "x@y.es" }).success).toBe(false);
    expect(managedCreateSchema.safeParse({ ...ok, phone: "600" }).success).toBe(false);
    expect(managedCreateSchema.safeParse({ ...ok, name: "Nombre Real" }).success).toBe(false);
  });
});
