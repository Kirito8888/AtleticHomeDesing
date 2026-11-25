import { describe, expect, it } from "vitest";

import { activeHref, BAR_USAGE_MIN, buildNav, MODULE_LABEL, moreActive, NAV_GROUPS, suggestBar, welcomeModules } from "./nav-items";

const hrefs = (n: ReturnType<typeof buildNav>) => n.groups.flatMap((g) => g.items.map((i) => i.href));

describe("navegación global v2.3", () => {
  it("la atleta no ve «Mis atletas» ni Administración", () => {
    const h = hrefs(buildNav({ role: "ATHLETE" }));
    expect(h).not.toContain("/coach");
    expect(h).not.toContain("/admin");
    expect(h).toContain("/settings/privacy");
  });

  it("la entrenadora ve Mis atletas; la administración, ambos", () => {
    expect(hrefs(buildNav({ role: "COACH" }))).toContain("/coach/athletes");
    expect(hrefs(buildNav({ role: "COACH" }))).not.toContain("/admin");
    const a = hrefs(buildNav({ role: "ADMIN" }));
    expect(a).toContain("/coach/athletes");
    expect(a).toContain("/admin");
  });

  it("módulos ocultos quitan ítems y no deja grupos vacíos", () => {
    const n = buildNav({ hidden: ["finance", "study"] });
    expect(n.groups.map((g) => g.id)).not.toContain("organize");
    expect(n.groups.every((g) => g.items.length > 0)).toBe(true);
  });

  it("la barra: Inicio + 3 destinos (más «Más» en el componente = 5 huecos), también con todo oculto", () => {
    expect(buildNav().bar.map((i) => i.href)).toEqual(["/", "/training", "/planning", "/recovery"]);
    // v3.0 G · Estudio y Finanzas también son candidatos: con todo lo demás oculto entran en la barra
    expect(buildNav({ hidden: ["training", "planning", "recovery", "nutrition"] }).bar.map((i) => i.href)).toEqual(["/", "/goals", "/clubs", "/study"]);
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

describe("bienvenida · módulos por defecto (Exp. B10)", () => {
  it("una cuenta nueva solo trae Entreno y Recuperación", () => {
    expect(welcomeModules({ onboarded: false, hidden: [] })).toEqual(["training", "recovery"]);
  });
  it("si ya hizo la bienvenida, se respeta lo que ve", () => {
    expect(welcomeModules({ onboarded: true, hidden: [] })).toEqual(["training", "recovery", "planning", "nutrition", "finance", "study"]);
    expect(welcomeModules({ onboarded: true, hidden: ["finance"] })).not.toContain("finance");
  });
  it("si ocultó módulos sin terminar la bienvenida, también se respeta", () => {
    expect(welcomeModules({ onboarded: false, hidden: ["study", "finance"] })).toEqual(["training", "recovery", "planning", "nutrition"]);
  });
  it("con lo nuevo, el menú solo deja Entreno y Salud de los módulos", () => {
    const hidden = ["planning", "nutrition", "finance", "study"];
    const h = hrefs(buildNav({ hidden }));
    expect(h).toEqual(["/training", "/goals", "/recovery", "/clubs", "/settings", "/settings/privacy", "/notifications", "/about"]);
    expect(buildNav({ hidden }).bar.map((i) => i.href)).toEqual(["/", "/training", "/recovery", "/goals"]);
  });
});

describe("las cuentas actuales ven el mismo menú (Exp. B10)", () => {
  it("menú completo de una atleta sin módulos ocultos", () => {
    expect(hrefs(buildNav())).toEqual(["/training", "/planning", "/goals", "/recovery", "/nutrition", "/study", "/finance", "/clubs", "/settings", "/settings/privacy", "/notifications", "/about"]);
  });
});

describe("v3.0 G · menú por intención y barra móvil configurable (V3-D01, V3-D02)", () => {
  const all = buildNav().candidates.map((i) => i.href);
  it("grupos por intención; «Atlenza IA» ya no existe, Estudio sí", () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual(["Entrenar", "Cuidarme", "Organizarme", "Con otras personas", "Configuración"]);
    const labels = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.label));
    expect(labels).toContain("Estudio");
    expect(labels.join()).not.toMatch(/Atlenza IA/);
    expect(MODULE_LABEL.study).toBe("Estudio");
  });
  it("candidatos: todo menos Configuración", () => {
    expect(all).toEqual(["/training", "/planning", "/goals", "/recovery", "/nutrition", "/study", "/finance", "/clubs"]);
  });
  it("sin uso: el orden por defecto de siempre", () => {
    expect(suggestBar([], all)).toEqual(["/training", "/planning", "/recovery"]);
  });
  it("con uso de Estudio y Finanzas: entran a un toque (rutas hijas cuentan)", () => {
    const usage = [
      { path: "/study", count: 20 },
      { path: "/study/schedule", count: 6 },
      { path: "/finance", count: 12 },
      { path: "/training", count: 9 },
      { path: "/planning", count: 3 },
    ];
    const bar = suggestBar(usage, all);
    expect(bar).toEqual(["/training", "/study", "/finance"]);
    expect(buildNav({ bar }).bar.map((i) => i.href)).toEqual(["/", "/training", "/study", "/finance"]);
  });
  it("una visita suelta no cambia la barra", () => {
    expect(suggestBar([{ path: "/finance", count: BAR_USAGE_MIN - 1 }], all)).toEqual(["/training", "/planning", "/recovery"]);
  });
  it("orden estable: el mismo conjunto da el mismo orden aunque cambien las visitas", () => {
    const a = suggestBar([{ path: "/study", count: 50 }, { path: "/finance", count: 10 }, { path: "/nutrition", count: 8 }], all);
    const b = suggestBar([{ path: "/study", count: 10 }, { path: "/finance", count: 50 }, { path: "/nutrition", count: 30 }], all);
    expect(a).toEqual(b);
  });
  it("la elección guardada manda, en su orden; módulos ocultos, repetidos y destinos inválidos se ignoran", () => {
    expect(buildNav({ bar: ["/finance", "/study", "/goals"] }).bar.map((i) => i.href)).toEqual(["/", "/finance", "/study", "/goals"]);
    expect(buildNav({ hidden: ["finance"], bar: ["/finance", "/study", "/study", "/admin"] }).bar.map((i) => i.href)).toEqual(["/", "/study", "/training", "/planning"]);
  });
  it("«Mis atletas» solo es candidato para quien lo ve", () => {
    expect(buildNav({ bar: ["/coach/athletes"] }).bar.map((i) => i.href)).not.toContain("/coach/athletes");
    expect(buildNav({ role: "COACH", bar: ["/coach/athletes"] }).bar.map((i) => i.href)[1]).toBe("/coach/athletes");
  });
});
