import { describe, expect, it } from "vitest";

import { LedgerError } from "./ledger";
import { assertTransferShape, linesImbalance, LinesChangedError, planLineEdit, transferLines } from "./edit-lines";

const cur = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("planLineEdit", () => {
  it("acepta las mismas líneas en otro orden si cuadran", () => {
    const lines = [
      { id: "c", accountId: "x", amountCents: -500 },
      { id: "a", accountId: "y", amountCents: 300 },
      { id: "b", accountId: "z", amountCents: 200 },
    ];
    expect(planLineEdit(cur, lines)).toEqual(lines);
  });

  it("rechaza añadir, quitar, cambiar o repetir líneas", () => {
    const l = (id: string, amountCents: number) => ({ id, accountId: "x", amountCents });
    expect(() => planLineEdit(cur, [l("a", 1), l("b", -1)])).toThrow(LinesChangedError);
    expect(() => planLineEdit(cur, [l("a", 1), l("b", 1), l("c", -1), l("d", -1)])).toThrow(LinesChangedError);
    expect(() => planLineEdit(cur, [l("a", 1), l("b", 1), l("z", -2)])).toThrow(LinesChangedError);
    expect(() => planLineEdit(cur, [l("a", 1), l("a", 1), l("c", -2)])).toThrow(LinesChangedError);
  });

  it("rechaza un asiento descuadrado o con una línea a 0 (sin ser error de forma)", () => {
    const l = (id: string, amountCents: number) => ({ id, accountId: "x", amountCents });
    const bad = () => planLineEdit(cur, [l("a", 100), l("b", 100), l("c", -150)]);
    expect(bad).toThrow(LedgerError);
    expect(bad).not.toThrow(LinesChangedError);
    expect(() => planLineEdit(cur, [l("a", 0), l("b", 100), l("c", -100)])).toThrow(/distinto de 0/);
  });
});

describe("transferencias", () => {
  const types: Record<string, string> = { bank: "ASSET", cash: "ASSET", card: "LIABILITY", gastos: "EXPENSE" };
  const typeOf = (id: string) => types[id];

  it("reconstruye conservando ids: la línea negativa sigue siendo el origen", () => {
    const lines = transferLines(
      [
        { id: "in", amountCents: 3000 },
        { id: "out", amountCents: -3000 },
      ],
      { amountCents: 4500, fromAccountId: "cash", toAccountId: "card", memo: "  pago  " },
    );
    expect(lines).toEqual([
      { id: "out", accountId: "cash", amountCents: -4500, memo: "pago" },
      { id: "in", accountId: "card", amountCents: 4500, memo: "pago" },
    ]);
    expect(linesImbalance(lines)).toBe(0);
    expect(() => assertTransferShape(lines, typeOf)).not.toThrow();
  });

  it("rechaza importe no positivo y formas que no son transferencia", () => {
    expect(() => transferLines([{ id: "a", amountCents: -1 }, { id: "b", amountCents: 1 }], { amountCents: 0, fromAccountId: "bank", toAccountId: "cash" })).toThrow(LedgerError);
    expect(() => assertTransferShape([{ accountId: "bank", amountCents: -1 }, { accountId: "bank", amountCents: 1 }], typeOf)).toThrow(/distintas/);
    expect(() => assertTransferShape([{ accountId: "bank", amountCents: -1 }, { accountId: "gastos", amountCents: 1 }], typeOf)).toThrow(/dinero/);
    expect(() => assertTransferShape([{ accountId: "bank", amountCents: 1 }, { accountId: "cash", amountCents: 1 }], typeOf)).toThrow(/sale/);
    expect(() => assertTransferShape([{ accountId: "bank", amountCents: -1 }], typeOf)).toThrow(/dos líneas/);
  });
});

describe("linesImbalance", () => {
  it("suma con signo e ignora valores no numéricos (campo vacío)", () => {
    expect(linesImbalance([{ amountCents: 500 }, { amountCents: -300 }])).toBe(200);
    expect(linesImbalance([{ amountCents: Number.NaN }, { amountCents: -300 }])).toBe(-300);
  });
});
