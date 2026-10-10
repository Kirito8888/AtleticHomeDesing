import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { eventsFromPdfText, eventsFromRows, parseLooseDate, readXlsxRows } from "./calendar-import";

/** .xlsx mínimo: textos compartidos, una celda numérica de fecha (serie de Excel) y otra en línea. */
function xlsx(): Uint8Array {
  const shared = `<sst><si><t>Calendario autonómico 2026</t></si><si><t>Fecha</t></si><si><t>Competición</t></si><si><t>Sede</t></si><si><t>Cto. Autonómico Sub-20 &amp; Sub-23</t></si><si><r><t>Valen</t></r><r><t>cia</t></r></si><si><t>Control de lanzamientos</t></si></sst>`;
  const sheet = `<worksheet><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c></row>
<row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3" t="s"><v>2</v></c><c r="C3" t="s"><v>3</v></c></row>
<row r="4"><c r="A4"><v>46068</v></c><c r="B4" t="s"><v>4</v></c><c r="C4" t="s"><v>5</v></c></row>
<row r="5"><c r="A5" t="inlineStr"><is><t>07/03/2026</t></is></c><c r="B5" t="s"><v>6</v></c></row>
</sheetData></worksheet>`;
  return zipSync({ "xl/sharedStrings.xml": strToU8(shared), "xl/worksheets/sheet1.xml": strToU8(sheet), "xl/workbook.xml": strToU8("<workbook/>") });
}

describe("fechas sueltas", () => {
  it("entiende los formatos habituales", () => {
    expect(parseLooseDate("15/02/2026")).toBe("2026-02-15");
    expect(parseLooseDate("15-2-26")).toBe("2026-02-15");
    expect(parseLooseDate("2026-02-15")).toBe("2026-02-15");
    expect(parseLooseDate("sábado 15 de febrero de 2026")).toBe("2026-02-15");
    expect(parseLooseDate("15 feb", 2026)).toBe("2026-02-15");
    expect(parseLooseDate("46068")).toBe("2026-02-15");
    expect(parseLooseDate("32/13/2026")).toBeNull();
  });
});

describe("Excel de la federación", () => {
  it("lee la primera hoja (textos compartidos, en línea y fechas como número) y usa la cabecera", () => {
    const rows = readXlsxRows(xlsx());
    expect(rows[2]).toEqual(["Fecha", "Competición", "Sede"]);
    expect(eventsFromRows(rows)).toEqual([
      { date: "2026-02-15", title: "Cto. Autonómico Sub-20 & Sub-23", location: "Valencia" },
      { date: "2026-03-07", title: "Control de lanzamientos", location: null },
    ]);
  });

  it("sin cabecera: primera columna con fecha y las siguientes con texto", () => {
    expect(eventsFromRows([["", "x"], ["21/06/2026", "Cto. de España absoluto", "Madrid"]])).toEqual([{ date: "2026-06-21", title: "Cto. de España absoluto", location: "Madrid" }]);
  });

  it("rechaza lo que no es un Excel", () => {
    expect(() => readXlsxRows(zipSync({ "a.txt": strToU8("x") }))).toThrow(/Excel/);
  });
});

describe("PDF del calendario", () => {
  it("líneas que empiezan por fecha; el año sale de la temporada del documento", () => {
    const text = `CALENDARIO DE PISTA AL AIRE LIBRE · TEMPORADA 2025-2026
Sábado 18 de octubre Control de otoño (Gandía)
14/02/2026 Cto. de España Sub-20 Pista Cubierta - Valencia
7 marzo · Lanzamientos largos de invierno
Página 1 de 3`;
    expect(eventsFromPdfText(text)).toEqual([
      { date: "2025-10-18", title: "Control de otoño", location: "Gandía" },
      { date: "2026-02-14", title: "Cto. de España Sub-20 Pista Cubierta", location: "Valencia" },
      { date: "2026-03-07", title: "Lanzamientos largos de invierno", location: null },
    ]);
  });
});
