import { describe, expect, it } from "vitest";

import { feeCreateSchema, feeSummary, parseAmount } from "./fees";

describe("cuotas del club", () => {
  it("parseAmount acepta formatos españoles y rechaza lo raro", () => {
    expect(parseAmount("25")).toBe(2500);
    expect(parseAmount("25,5")).toBe(2550);
    expect(parseAmount("25.50 €")).toBe(2550);
    expect(parseAmount("1.250,00")).toBe(125000);
    for (const bad of ["", "0", "-3", "abc", "1,234", "1e3", "999999999"]) expect(parseAmount(bad)).toBeNull();
  });

  it("validación del apunte", () => {
    expect(feeCreateSchema.safeParse({ memberId: "m", concept: "Cuota octubre", amount: "30", dueDate: "2026-10-31" }).success).toBe(true);
    expect(feeCreateSchema.safeParse({ memberId: "m", concept: " ", amount: "30", dueDate: "2026-10-31" }).success).toBe(false);
    expect(feeCreateSchema.safeParse({ memberId: "m", concept: "x", amount: "0", dueDate: "2026-10-31" }).success).toBe(false);
  });

  it("resumen: pagado, pendiente y vencidas", () => {
    const s = feeSummary(
      [
        { amountCents: 3000, status: "PAID", dueDate: "2026-09-30" },
        { amountCents: 3000, status: "PENDING", dueDate: "2026-10-01" },
        { amountCents: 2000, status: "PENDING", dueDate: "2026-11-01" },
      ],
      "2026-10-14",
    );
    expect(s).toEqual({ paidCents: 3000, pendingCents: 5000, overdue: 1 });
  });
});
