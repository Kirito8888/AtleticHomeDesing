import { describe, expect, it } from "vitest";

import { topCategories, type CategoryUse } from "./top-categories";

const use = (transactionId: string, categoryId: string, kind = "EXPENSE", name = categoryId): CategoryUse => ({ transactionId, categoryId, name, kind });

describe("topCategories (N10)", () => {
  it("ordena por número de movimientos y separa gasto e ingreso", () => {
    const r = topCategories([use("t1", "comida"), use("t2", "comida"), use("t3", "transporte"), use("t4", "nomina", "INCOME"), use("t5", "beca", "INCOME"), use("t6", "beca", "INCOME")]);
    expect(r.EXPENSE).toEqual(["comida", "transporte"]);
    expect(r.INCOME).toEqual(["beca", "nomina"]);
  });

  it("un asiento con dos líneas de la misma categoría cuenta una vez", () => {
    const r = topCategories([use("t1", "ocio"), use("t1", "ocio"), use("t1", "ocio"), use("t2", "comida"), use("t3", "comida")]);
    expect(r.EXPENSE).toEqual(["comida", "ocio"]);
  });

  it("desempata por nombre y respeta el tope", () => {
    const rows = ["f", "e", "d", "c", "b", "a", "g"].map((c, i) => use(`t${i}`, c));
    expect(topCategories(rows).EXPENSE).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(topCategories(rows, 2).EXPENSE).toEqual(["a", "b"]);
  });

  it("sin datos no hay atajos", () => {
    expect(topCategories([])).toEqual({ EXPENSE: [], INCOME: [] });
  });
});
