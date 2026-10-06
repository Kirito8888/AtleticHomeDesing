import { describe, expect, it } from "vitest";

import {
  bankMappingSchema,
  csvToMovements,
  detectDelimiter,
  looksLikeNorma43,
  parseAmount,
  parseCsv,
  parseDate,
  parseNorma43,
} from "./bank-import";
import { movementHashes } from "./bank-import-hash";

describe("importes y fechas", () => {
  it("formatos de importe habituales", () => {
    expect(parseAmount("1.234,56", ",")).toBe(123456);
    expect(parseAmount("-12,5", ",")).toBe(-1250);
    expect(parseAmount("12,50-", ",")).toBe(-1250);
    expect(parseAmount("(12.50)", ".")).toBe(-1250);
    expect(parseAmount("1 234,56 €", ",")).toBe(123456);
    expect(parseAmount("+3,00", ",")).toBe(300);
    expect(parseAmount("1,234.56", ".")).toBe(123456);
    expect(parseAmount("", ",")).toBeNull();
    expect(parseAmount("abc", ",")).toBeNull();
    expect(parseAmount("12,345", ",")).toBeNull(); // 3 decimales: probablemente columna mal mapeada
  });

  it("fechas: formatos y validación", () => {
    expect(parseDate("05/10/2026", "DD/MM/YYYY")).toBe("2026-10-05");
    expect(parseDate("05-10-26", "DD-MM-YYYY")).toBe("2026-10-05");
    expect(parseDate("2026-10-05", "YYYY-MM-DD")).toBe("2026-10-05");
    expect(parseDate("10/05/2026", "MM/DD/YYYY")).toBe("2026-10-05");
    expect(parseDate("31/02/2026", "DD/MM/YYYY")).toBeNull();
  });
});

describe("CSV", () => {
  it("comillas, separador dentro de comillas, comillas dobladas, CRLF y BOM", () => {
    const rows = parseCsv('﻿a;b;c\r\n"x;y";"di ""hola""";3\r\n', ";");
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["x;y", 'di "hola"', "3"],
    ]);
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
  });

  it("estilo banca española: líneas de título, importe con signo y coma decimal", () => {
    const text = [
      "Titular: ATLETA EJEMPLO",
      "Cuenta: ES00 0000 0000 0000 0000 0000",
      "Fecha;Fecha valor;Concepto;Importe;Saldo",
      "01/10/2026;01/10/2026;NOMINA OCTUBRE;1.850,00;2.350,00",
      "03/10/2026;03/10/2026;COMPRA TARJETA DECATHLON;-89,99;2.260,01",
      "03/10/2026;03/10/2026;CAFETERIA;-1,50;2.258,51",
      "03/10/2026;03/10/2026;CAFETERIA;-1,50;2.257,01",
      "04/10/2026;04/10/2026;FECHA MAL;xx;0",
    ].join("\n");
    const mapping = bankMappingSchema.parse({ skipRows: 2, dateCol: 0, descCol: 2, amountCol: 3 });
    const r = csvToMovements(text, mapping);
    expect(r.movements.map((m) => [m.date, m.amountCents])).toEqual([
      ["2026-10-01", 185000],
      ["2026-10-03", -8999],
      ["2026-10-03", -150],
      ["2026-10-03", -150],
    ]);
    expect(r.errors).toEqual([{ line: 8, message: "Importe no válido" }]);
  });

  it("columnas separadas de cargo y abono", () => {
    const text = "Fecha;Concepto;Cargo;Abono\n02/10/2026;Gimnasio;45,00;\n05/10/2026;Bizum de Ana;;20,00\n";
    const r = csvToMovements(text, bankMappingSchema.parse({ dateCol: 0, descCol: 1, debitCol: 2, creditCol: 3 }));
    expect(r.movements.map((m) => m.amountCents)).toEqual([-4500, 2000]);
  });

  it("formato inglés con comas y comillas, gastos en positivo (invertir signo)", () => {
    const text = 'Date,Description,Amount\n2026-10-02,"Shoes, spikes",120.00\n';
    const r = csvToMovements(
      text,
      bankMappingSchema.parse({ delimiter: ",", dateCol: 0, dateFormat: "YYYY-MM-DD", descCol: 1, amountCol: 2, decimal: ".", invertSign: true }),
    );
    expect(r.movements).toEqual([{ line: 2, date: "2026-10-02", description: "Shoes, spikes", payee: null, amountCents: -12000 }]);
  });

  it("exige importe o cargo+abono", () => {
    expect(bankMappingSchema.safeParse({ dateCol: 0, descCol: 1 }).success).toBe(false);
  });
});

/** Registro de 80 caracteres a partir de [posición inicial (1-based), valor]. */
function rec(fields: Array<[number, string]>): string {
  const a = Array(80).fill(" ");
  for (const [pos, v] of fields) for (let i = 0; i < v.length; i++) a[pos - 1 + i] = v[i];
  return a.join("");
}
const amt = (cents: number) => String(Math.abs(cents)).padStart(14, "0");

function norma43(movs: Array<{ date: string; cents: number; ref: string; extra?: string }>, opening = 100000, tamper = false) {
  const lines = [rec([[1, "11"], [3, "0000"], [7, "0001"], [11, "0123456789"], [21, "261001"], [27, "261031"], [33, "2"], [34, amt(opening)], [48, "978"], [51, "3"], [52, "ATLETA EJEMPLO"]])];
  for (const m of movs) {
    lines.push(rec([[1, "22"], [7, "0001"], [11, m.date], [17, m.date], [23, "12"], [25, "000"], [28, m.cents < 0 ? "1" : "2"], [29, amt(m.cents)], [43, "0000000000"], [53, m.ref.padEnd(12).slice(0, 12)], [65, ""]]));
    if (m.extra) lines.push(rec([[1, "23"], [3, "01"], [5, m.extra]]));
  }
  const used = tamper ? movs.slice(1) : movs;
  const debit = used.filter((m) => m.cents < 0);
  const credit = used.filter((m) => m.cents > 0);
  const sum = (xs: typeof movs) => xs.reduce((a, m) => a + Math.abs(m.cents), 0);
  const closing = opening + sum(credit) - sum(debit);
  lines.push(rec([[1, "33"], [3, "0000"], [7, "0001"], [11, "0123456789"], [21, String(debit.length).padStart(5, "0")], [26, amt(sum(debit))], [40, String(credit.length).padStart(5, "0")], [45, amt(sum(credit))], [59, closing < 0 ? "1" : "2"], [60, amt(closing)], [74, "978"]]));
  lines.push(rec([[1, "88"], [3, "999999999999999999"], [21, String(lines.length - 1).padStart(6, "0")]]));
  return lines.join("\r\n");
}

describe("Norma 43", () => {
  const movs = [
    { date: "261001", cents: 185000, ref: "NOMINA", extra: "NOMINA OCTUBRE EMPRESA SL" },
    { date: "261003", cents: -8999, ref: "TARJETA", extra: "COMPRA DECATHLON MADRID" },
    { date: "261005", cents: -4500, ref: "RECIBO GYM" },
  ];

  it("lee movimientos, conceptos complementarios y cuadra con el registro 33", () => {
    const text = norma43(movs);
    expect(looksLikeNorma43(text)).toBe(true);
    const r = parseNorma43(text);
    expect(r.errors).toEqual([]);
    expect(r.movements.map((m) => [m.date, m.amountCents])).toEqual([
      ["2026-10-01", 185000],
      ["2026-10-03", -8999],
      ["2026-10-05", -4500],
    ]);
    expect(r.movements[0].description).toBe("NOMINA OCTUBRE EMPRESA SL · NOMINA");
    expect(r.movements[2].description).toBe("RECIBO GYM");
    expect(r.check).toMatchObject({ openingCents: 100000, closingCents: 100000 + 185000 - 8999 - 4500 });
  });

  it("detecta un fichero incompleto (los totales del banco no cuadran)", () => {
    const r = parseNorma43(norma43(movs, 100000, true));
    expect(r.errors.at(-1)?.message).toMatch(/no cuadran/);
  });
});

describe("huellas para no duplicar", () => {
  it("dos cafés iguales el mismo día son distintos, y la huella es estable al reimportar", () => {
    const m = (amountCents: number) => ({ line: 1, date: "2026-10-03", description: "CAFETERIA", payee: null, amountCents });
    const a = movementHashes([m(-150), m(-150), m(-8999)], "acc1");
    expect(new Set(a).size).toBe(3);
    expect(movementHashes([m(-150), m(-150), m(-8999)], "acc1")).toEqual(a);
    expect(movementHashes([m(-150)], "acc2")[0]).not.toBe(a[0]); // otra cuenta, otra huella
  });
});
