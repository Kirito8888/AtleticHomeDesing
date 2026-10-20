import { describe, expect, it } from "vitest";

import { catalogErrorText } from "./catalog-sync";
import { OffError } from "./openfoodfacts";

describe("catalogErrorText", () => {
  it("texto fijo por tipo de fallo, sin el detalle del error", () => {
    expect(catalogErrorText(new OffError("OpenFoodFacts respondió 500", 502))).not.toMatch(/500/);
    expect(catalogErrorText(new Error("connect ECONNREFUSED 10.0.0.1:5432"))).not.toMatch(/ECONNREFUSED|10\.0/);
    expect(catalogErrorText(new OffError("x", 429))).toMatch(/limit/);
  });
});
