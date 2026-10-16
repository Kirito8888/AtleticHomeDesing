import { describe, expect, it } from "vitest";

import { activeHref, buildNav, moreActive } from "./nav-items";

const hrefs = (n: ReturnType<typeof buildNav>) => n.groups.flatMap((g) => g.items.map((i) => i.href));

describe("navegación global v2.3", () => {
  it("la atleta no ve «Mis atletas» ni Administración", () => {
    const h = hrefs(buildNav({ role: "ATHLETE" }));
    expect(h).not.toContain("/coach");
    expect(h).not.toContain("/admin");
    expect(h).toContain("/settings/privacy");
  });

  it("la entrenadora ve Mis atletas; la administración, ambos", () => {
    expect(hrefs(buildNav({ role: "COACH" }))).toContain("/coach");
    expect(hrefs(buildNav({ role: "COACH" }))).not.toContain("/admin");
    const a = hrefs(buildNav({ role: "ADMIN" }));
    expect(a).toContain("/coach");
    expect(a).toContain("/admin");
  });

  it("módulos ocultos quitan ítems y no deja grupos vacíos", () => {
    const n = buildNav({ hidden: ["finance", "study"] });
    expect(n.groups.map((g) => g.id)).not.toContain("tools");
    expect(n.groups.every((g) => g.items.length > 0)).toBe(true);
  });

  it("la barra: Inicio + 3 destinos (más «Más» en el componente = 5 huecos), también con todo oculto", () => {
    expect(buildNav().bar.map((i) => i.href)).toEqual(["/", "/training", "/planning", "/recovery"]);
    expect(buildNav({ hidden: ["training", "planning", "recovery", "nutrition"] }).bar.map((i) => i.href)).toEqual(["/", "/goals", "/clubs"]);
  });

  it("agrupa Ajustes, Privacidad y Notificaciones bajo Configuración", () => {
    const c = buildNav().groups.find((g) => g.id === "config")!;
    expect(c.items.map((i) => i.href)).toEqual(expect.arrayContaining(["/settings", "/settings/privacy", "/notifications"]));
  });

  it("activeHref elige el prefijo más largo", () => {
    expect(activeHref("/settings/privacy", ["/settings", "/settings/privacy"])).toBe("/settings/privacy");
    expect(activeHref("/settings", ["/settings", "/settings/privacy"])).toBe("/settings");
    expect(activeHref("/training/rm", ["/", "/training"])).toBe("/training");
    expect(activeHref("/x", ["/", "/training"])).toBeNull();
  });

  it("«Más» se marca solo fuera de la barra", () => {
    const { bar } = buildNav();
    expect(moreActive("/", bar)).toBe(false);
    expect(moreActive("/training/diary", bar)).toBe(false);
    expect(moreActive("/clubs", bar)).toBe(true);
    expect(moreActive("/settings/privacy", bar)).toBe(true);
  });
});
