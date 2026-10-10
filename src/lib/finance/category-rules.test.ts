import { describe, expect, it } from "vitest";

import { matchRule, normalizeText, patternFor } from "@/lib/finance/category-rules";

describe("reglas de categoría", () => {
  it("saca el comercio del concepto", () => {
    expect(patternFor("COMPRA TARJ. 1234 MERCADONA VALENCIA")).toBe("mercadona valencia");
    expect(patternFor("Recibo SEPA Vodafone España SAU 2026/10")).toBe("vodafone sau");
    expect(patternFor("Bizum 12,50")).toBeNull();
  });
  it("normaliza acentos y signos", () => {
    expect(normalizeText("  Farmacia  Peñas-Ávila ")).toBe("farmacia penas avila");
  });
  it("aplica la regla más específica", () => {
    const rules = [
      { pattern: "mercadona", categoryId: "super" },
      { pattern: "mercadona valencia", categoryId: "super-vlc" },
      { pattern: "renfe", categoryId: "viajes" },
    ];
    expect(matchRule(rules, "COMPRA TARJ. MERCADONA VALENCIA 22/10")?.categoryId).toBe("super-vlc");
    expect(matchRule(rules, "MERCADONA ALZIRA")?.categoryId).toBe("super");
    expect(matchRule(rules, "Amazon")).toBeNull();
  });
});
