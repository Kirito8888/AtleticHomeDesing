import { describe, expect, it } from "vitest";

import { csvCell, toCsv } from "./csv";

describe("csv", () => {
  it("usa coma decimal y escapa separadores y comillas", () => {
    expect(csvCell(12.5)).toBe("12,5");
    expect(csvCell('a;b "c"')).toBe('"a;b ""c"""');
    expect(csvCell(null)).toBe("");
    expect(csvCell(new Date("2026-10-06T00:00:00Z"))).toBe("2026-10-06");
  });

  it("neutraliza fórmulas en textos pero no en números negativos", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("-12")).toBe("'-12");
    expect(csvCell(-12.5)).toBe("-12,5");
  });

  it("empieza por BOM y separa filas con CRLF", () => {
    const out = toCsv(["a", "b"], [[1, "x"]]);
    expect(out.startsWith("﻿a;b\r\n1;x")).toBe(true);
  });
});
