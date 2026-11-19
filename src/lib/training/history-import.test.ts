import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import {
  attachSets,
  findSeriesHeader,
  parseSeriesSheet,
  buildTemplateCsv,
  buildTemplateXlsx,
  classify,
  colIndex,
  colLetter,
  contributesLoad,
  dedupeKey,
  detectHeaderRow,
  guessMapping,
  guessUnits,
  parseDateCell,
  parseDistanceM,
  parseDurationSec,
  parseNumber,
  parseRows,
  readSpreadsheet,
} from "./history-import";

const enc = (s: string) => strToU8(s);

/** xlsx mínimo sintético: `cells` por hoja, con cadenas compartidas o en línea. */
function xlsx(sheets: Array<{ name: string; xml: string }>, opts: { shared?: string[]; date1904?: boolean } = {}) {
  const files: Record<string, Uint8Array> = {
    "xl/workbook.xml": enc(
      `<workbook xmlns:r="x"><workbookPr${opts.date1904 ? ' date1904="1"' : ""}/><sheets>${sheets.map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": enc(`<Relationships>${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`),
  };
  sheets.forEach((s, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = enc(`<worksheet><sheetData>${s.xml}</sheetData></worksheet>`)));
  if (opts.shared) files["xl/sharedStrings.xml"] = enc(`<sst>${opts.shared.map((t) => `<si><t>${t}</t></si>`).join("")}</sst>`);
  return zipSync(files);
}
const inl = (ref: string, t: string) => `<c r="${ref}" t="inlineStr"><is><t>${t}</t></is></c>`;
const num = (ref: string, v: number | string) => `<c r="${ref}"><v>${v}</v></c>`;

describe("valores", () => {
  it("números con coma, punto y miles", () => {
    expect(parseNumber("5,2")).toBe(5.2);
    expect(parseNumber("1.234,5")).toBe(1234.5);
    expect(parseNumber("1,234.5")).toBe(1234.5);
    expect(parseNumber("1 234")).toBe(1234);
    expect(parseNumber("abc")).toBeNull();
  });
  it("fechas: ISO, dd/mm/aaaa, serie de Excel (1900 y 1904) e inválidas", () => {
    expect(parseDateCell("2026-10-05")).toBe("2026-10-05");
    expect(parseDateCell("5/10/2026")).toBe("2026-10-05");
    expect(parseDateCell("05-10-26")).toBe("2026-10-05");
    expect(parseDateCell("10/25/2026")).toBe("2026-10-25"); // mes > 12: se intercambia
    expect(parseDateCell("46289")).toBe("2026-09-24");
    expect(parseDateCell("46289", true)).toBe("2030-09-25");
    expect(parseDateCell("31/02/2026")).toBeNull();
    expect(parseDateCell("Fecha")).toBeNull();
    expect(parseDateCell("")).toBeNull();
  });
  it("duración", () => {
    expect(parseDurationSec("90")).toBe(5400);
    expect(parseDurationSec("90 min")).toBe(5400);
    expect(parseDurationSec("1:30")).toBe(5400);
    expect(parseDurationSec("1:30:15")).toBe(5415);
    expect(parseDurationSec("1h30")).toBe(5400);
    expect(parseDurationSec("1,5 h")).toBe(5400);
    expect(parseDurationSec("1.5", "h")).toBe(5400);
    expect(parseDurationSec("0.0625")).toBe(5400); // fracción de día de Excel
    expect(parseDurationSec("45", "s")).toBe(45);
    expect(parseDurationSec("0")).toBeNull();
    expect(parseDurationSec("99999")).toBeNull();
    expect(parseDurationSec("mucho")).toBeNull();
  });
  it("distancia", () => {
    expect(parseDistanceM("8,2")).toBe(8200);
    expect(parseDistanceM("5200 m")).toBe(5200);
    expect(parseDistanceM("10 km")).toBe(10000);
    expect(parseDistanceM("400", "m")).toBe(400);
    expect(parseDistanceM("lejos")).toBeNull();
  });
  it("columnas por letra", () => {
    expect(colIndex("A")).toBe(0);
    expect(colIndex("AB")).toBe(27);
    expect(colLetter(27)).toBe("AB");
  });
  it("tipos", () => {
    expect(classify("Correr")).toEqual({ kind: "TRACK", modality: "RUN" });
    expect(classify("Rodaje")).toEqual({ kind: "TRACK", modality: "RUN" });
    expect(classify("Bici")).toEqual({ kind: "TRACK", modality: "CYCLE" });
    expect(classify("Natación")).toEqual({ kind: "TRACK", modality: "SWIM" });
    expect(classify("Andar")).toEqual({ kind: "TRACK", modality: "WALK" });
    expect(classify("Gimnasio")).toEqual({ kind: "STRENGTH", modality: null });
    expect(classify("Yoga")).toEqual({ kind: "MIXED", modality: null });
  });
});

describe("leer ficheros", () => {
  it("CSV con ; , tabulador y BOM", () => {
    for (const sep of [";", ",", "\t"]) {
      const csv = `﻿Fecha${sep}Título${sep}Duración\r\n2026-01-05${sep}Rodaje${sep}45\r\n`;
      const s = readSpreadsheet(enc(csv), "x.csv");
      expect(s.sheets[0].rows).toEqual([["Fecha", "Título", "Duración"], ["2026-01-05", "Rodaje", "45"]]);
    }
  });
  it("XLSX con cadenas compartidas, huecos, fórmulas y varias hojas", () => {
    const bytes = xlsx(
      [
        { name: "Datos", xml: `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2">${num("A2", 46289)}<c r="C2" t="str"><f>A2+1</f><v>listo &amp; bien</v></c></row>` },
        { name: "Otra", xml: `<row r="1">${inl("A1", "x")}</row>` },
      ],
      { shared: ["Fecha", "Notas"] },
    );
    const s = readSpreadsheet(bytes, "x.xlsx");
    expect(s.sheets.map((x) => x.name)).toEqual(["Datos", "Otra"]);
    expect(s.sheets[0].rows).toEqual([["Fecha", "", "Notas"], ["46289", "", "listo & bien"]]);
  });
  it("XLSX con 1904 y celdas vacías autocerradas", () => {
    const s = readSpreadsheet(xlsx([{ name: "H", xml: `<row r="1"><c r="A1" s="3"/>${inl("B1", "a")}</row>` }], { date1904: true }), "x.xlsx");
    expect(s.date1904).toBe(true);
    expect(s.sheets[0].rows[0]).toEqual(["", "a"]);
  });
  it("rechaza vacíos, .xls, zips ajenos, zips corruptos y ficheros enormes", () => {
    expect(() => readSpreadsheet(new Uint8Array(), "x.csv")).toThrow(/vacío/);
    expect(() => readSpreadsheet(new Uint8Array([0xd0, 0xcf, 0x11]), "x.xls")).toThrow(/xls/);
    expect(() => readSpreadsheet(zipSync({ "a.txt": enc("hola") }), "x.xlsx")).toThrow(/no parece/);
    expect(() => readSpreadsheet(new Uint8Array([0x50, 0x4b, 1, 2, 3]), "x.xlsx")).toThrow(/No se pudo abrir/);
    expect(() => readSpreadsheet(new Uint8Array(2 * 1024 * 1024 + 1), "x.csv")).toThrow(/2 MB/);
  });
  it("tope de contenido descomprimido (zip bomb)", () => {
    const big = "<worksheet>" + " ".repeat(21 * 1024 * 1024) + "</worksheet>";
    const bytes = zipSync({
      "xl/workbook.xml": enc('<workbook xmlns:r="x"><sheets><sheet name="H" r:id="rId1"/></sheets></workbook>'),
      "xl/_rels/workbook.xml.rels": enc('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
      "xl/worksheets/sheet1.xml": enc(big),
    });
    expect(bytes.length).toBeLessThan(2 * 1024 * 1024);
    expect(() => readSpreadsheet(bytes, "x.xlsx")).toThrow(/ocupa demasiado/);
  });
  it("las plantillas se leen de vuelta (Excel y CSV) con el mismo contenido", () => {
    const a = readSpreadsheet(buildTemplateXlsx(), "p.xlsx").sheets[0].rows;
    const b = readSpreadsheet(enc(buildTemplateCsv()), "p.csv").sheets[0].rows;
    expect(a.length).toBe(6);
    expect(a[0]).toEqual(b[0]);
    expect(a[1].slice(0, 3)).toEqual(b[1].slice(0, 3));
    for (const rows of [a, b]) {
      const mapping = guessMapping(rows[detectHeaderRow(rows)]);
      expect(mapping).toMatchObject({ date: 0, title: 1, type: 2, duration: 3, distance: 4, rpe: 5, load: 6, notes: [7] });
      const r = parseRows({ name: "x", rows }, 0, mapping);
      expect(r.rows).toHaveLength(5);
      expect(r.rows[0]).toMatchObject({ date: "2026-01-05", title: "Rodaje suave", kind: "TRACK", modality: "RUN", durationSec: 2700, distanceM: 8200, rpe: 4 });
      expect(r.rows[1]).toMatchObject({ kind: "STRENGTH", distanceM: null });
      expect(r.issues).toEqual([]);
    }
  });
});

describe("mapeo y filas", () => {
  // Estructura parecida a un registro real: título y nota antes de la cabecera, leyenda al final.
  const rows = [
    ["Entrenamientos realizados"],
    ["Un día por fila"],
    [],
    ["Fecha", "Día", "Sesión", "Qué hice", "Notas / dolor", "Origen"],
    ["46289", "Jueves", "Pista + gimnasio", "Calentamiento y saltos", "Sin molestias", "Chat"],
    ["46290", "Viernes", "Sin entrenar", "", "", ""],
    ["46293", "Lunes", "Rodaje", "", "", ""],
    [],
    ["Leyenda"],
    ["A", "Confirmado"],
  ];
  it("detecta la cabecera en la fila 4 y varias columnas de notas; «Día» no es la fecha", () => {
    expect(detectHeaderRow(rows)).toBe(3);
    const m = guessMapping(rows[3]);
    expect(m).toMatchObject({ date: 0, title: 2, type: null, duration: null, notes: [3, 4] });
  });
  it("omite descansos, leyenda y filas sin fecha; une las notas; sin duración/RPE no suma carga", () => {
    const m = guessMapping(rows[3]);
    const r = parseRows({ name: "x", rows }, 3, m);
    expect(r.rows.map((x) => [x.line, x.date, x.title])).toEqual([
      [5, "2026-09-24", "Pista + gimnasio"],
      [7, "2026-09-28", "Rodaje"],
    ]);
    expect(r.rows[0].notes).toBe("Calentamiento y saltos · Sin molestias");
    expect(r.skipped.map((s) => s.reason)).toEqual(["Descanso", "Sin fecha válida", "Sin fecha válida"]);
    expect(contributesLoad(r.rows[0])).toBe(false);
  });
  it("valores por defecto solo en filas sin dato y marcadas como estimadas", () => {
    const m = guessMapping(["Fecha", "Título", "Duración", "RPE"]);
    const r = parseRows({ name: "x", rows: [["Fecha", "Título", "Duración", "RPE"], ["2026-01-05", "A", "60", "5"], ["2026-01-06", "B", "", ""]] }, 0, m, { defaults: { durationMin: 40, rpe: 4 } });
    expect(r.rows[0]).toMatchObject({ durationSec: 3600, rpe: 5, estimated: false });
    expect(r.rows[1]).toMatchObject({ durationSec: 2400, rpe: 4, estimated: true });
    expect(r.rows[1].notes).toMatch(/estimados/);
    expect(contributesLoad(r.rows[1])).toBe(true);
  });
  it("valores inválidos no tiran la fila: se avisan", () => {
    const m = guessMapping(["Fecha", "Título", "Duración", "RPE", "Distancia", "Carga"]);
    const r = parseRows({ name: "x", rows: [[], ["2026-01-05", "A", "mucho", "11", "lejos", "5000"]] }, 0, m);
    expect(r.rows).toHaveLength(1);
    expect(r.issues.map((i) => i.message)).toHaveLength(4);
    expect(r.rows[0]).toMatchObject({ durationSec: null, rpe: null, distanceM: null, manualTss: null });
  });
  it("unidades según la cabecera", () => {
    const h = ["Fecha", "Duración (h)", "Distancia (m)"];
    expect(guessUnits(h, guessMapping(h))).toEqual({ duration: "h", distance: "m" });
    const h2 = ["Fecha", "Duración", "Distancia"];
    expect(guessUnits(h2, guessMapping(h2))).toEqual({ duration: "min", distance: "km" });
  });
});

describe("duplicados", () => {
  it("la clave ignora tildes, mayúsculas y espacios; distingue fecha y duración", () => {
    const a = dedupeKey({ date: "2026-01-05", title: "  Rodaje   Fácil ", durationSec: 2700 });
    expect(a).toBe(dedupeKey({ date: "2026-01-05", title: "rodaje facil", durationSec: 2700 }));
    expect(a).not.toBe(dedupeKey({ date: "2026-01-06", title: "rodaje facil", durationSec: 2700 }));
    expect(a).not.toBe(dedupeKey({ date: "2026-01-05", title: "rodaje facil", durationSec: 3000 }));
    expect(dedupeKey({ date: "2026-01-05", title: null, durationSec: null })).toBe("2026-01-05||");
  });
});

describe("hoja Series (fuerza)", () => {
  const sheet = {
    name: "Series",
    rows: [
      ["Fecha", "Ejercicio", "Series", "Reps", "Kg", "Nota"],
      ["2026-09-29", "Sentadilla frontal", "3", "5", "95", "plan"],
      ["2026-09-29", "Press banca mancuernas", "4", "6", "22,5", ""],
      ["2026-09-30", "Algo", "x", "5", "10", ""],
      ["", "Sin fecha", "1", "5", "10", ""],
    ],
  };
  it("detecta la cabecera y expande series × reps × kg", () => {
    expect(findSeriesHeader(sheet)?.headerIdx).toBe(0);
    expect(findSeriesHeader({ name: "x", rows: [["Fecha", "Título"]] })).toBeNull();
    const { byDate, issues } = parseSeriesSheet(sheet);
    const sets = byDate.get("2026-09-29")!;
    expect(sets).toHaveLength(7);
    expect(sets[0]).toMatchObject({ exercise: "Sentadilla frontal", reps: 5, weightKg: 95, notes: "plan" });
    expect(sets[3]).toMatchObject({ exercise: "Press banca mancuernas", reps: 6, weightKg: 22.5 });
    expect(issues).toHaveLength(2);
  });
  it("las series van a la sesión de su fecha y la de pista pasa a mixta; las fechas sin sesión se devuelven", () => {
    const { byDate } = parseSeriesSheet({ ...sheet, rows: [...sheet.rows.slice(0, 3), ["2026-10-01", "Sentadilla trasera", "1", "5", "100", ""]] });
    const rows = [{ line: 2, date: "2026-09-29", title: "A", kind: "TRACK" as const }];
    const out = attachSets(rows, byDate);
    expect(out.rows[0].kind).toBe("MIXED");
    expect(out.rows[0].sets).toHaveLength(7);
    expect(out.unmatched).toEqual(["2026-10-01"]);
  });
});
