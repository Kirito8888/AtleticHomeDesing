import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { parsePlanDocx } from "./docx";

// Documento SINTÉTICO (sin datos reales) con la misma estructura que los planes en Word de mesociclos.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const p = (t: string) => `<w:p><w:r><w:t>${esc(t)}</w:t></w:r></w:p>`;
const tbl = (rows: string[][]) => `<w:tbl>${rows.map((r) => `<w:tr>${r.map((c) => `<w:tc>${p(c)}</w:tc>`).join("")}</w:tr>`).join("")}</w:tbl>`;
const docx = (body: string) =>
  zipSync({ "word/document.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`) });
const EX_HEAD = ["Ejercicio", "Series", "Reps", "RIR", "Desc.", "Tempo", "Serie 1 kg×reps", "RIR real"];

const body = [
  p("PLAN DE ENTRENAMIENTO"),
  p("Mesociclo 2 · 12 semanas · Hipertrofia"),
  tbl([["Nombre:", "Persona Ficticia"], ["Entrenador:", "Entrenadora"], ["Inicio:", "Lunes 28/12/2026"], ["Final:", "Semana del 15/02/2027 (tests)"], ["Días:", "Lunes y miércoles · unos 75 min"]]),
  p("Cómo leer tu plan"),
  p("El RIR es cuántas repeticiones te quedan al terminar la serie."),
  tbl([["RIR", "Qué significa"], ["3", "Te sobran 3"]]),
  tbl([["SEMANA 1", "Bloque 1 · Hipertrofia", "CARGA · 28/12-01/01"]]),
  p("Semana normal."),
  p("LUNES 28/12 · Día A · Cadena anterior"),
  tbl([EX_HEAD, ["Hack squat (o sentadilla en máquina)", "3", "8-10", "2", "2:30", "3-1-1-0", "", ""], ["Core A: plancha", "2", "40 s + 15", "—", "0:45", "—", "", ""]]),
  p("Cómo llego (0-10): ____   Esfuerzo de la sesión (0-10): ____"),
  p("MIÉRCOLES 30/12 · Día B · Cadena posterior"),
  tbl([EX_HEAD, ["Peso muerto rumano con barra", "3", "8-10", "3", "3:00", "3-0-1-0", "", ""]]),
  tbl([["SEMANA 2", "Bloque 1 · Hipertrofia", "DESCARGA · 04/01-08/01"]]),
  p("Semana de descarga: menos series."),
  p("LUNES 04/01 · Día A · Cadena anterior"),
  tbl([EX_HEAD, ["Hack squat (o sentadilla en máquina)", "2", "8-10", "3", "2:30", "3-1-1-0", "", ""]]),
  p("VIERNES 08/01 · Descanso"),
  tbl([["Descansa", "Sin sesión"]]),
  p("LUNES 15/02 · Test 1 · tren inferior"),
  tbl([["Prueba", "Carga"], ["Sentadilla", "60 kg"]]),
  p("Medidas (semanas 1 y 12)"),
  p("Por la mañana, antes de entrenar, con la misma cinta."),
].join("");

describe("plan en Word (.docx)", () => {
  const m = parsePlanDocx(docx(body))!;
  it("lee código, nombre, fechas (con el cambio de año) y semanas", () => {
    expect(m.code).toBe("M2");
    expect(m.name).toBe("Mesociclo 2 · 12 semanas · Hipertrofia");
    expect(m.start).toBe("2026-12-28");
    expect(m.end).toBe("2027-02-15");
    expect(m.weeks.map((w) => [w.number, w.start, w.end])).toEqual([[1, "2026-12-28", "2027-01-01"], [2, "2027-01-04", "2027-01-08"]]);
    expect(m.weeks[1].text).toMatch(/descarga/i);
  });
  it("una sesión por día con fecha, A/B, duración y tabla de ejercicios completa; el descanso no crea sesión", () => {
    expect(m.days.map((d) => [d.date, d.title, d.week, d.weekday])).toEqual([
      ["2026-12-28", "Día A · Cadena anterior", 1, "Lunes"],
      ["2026-12-30", "Día B · Cadena posterior", 1, "Miércoles"],
      ["2027-01-04", "Día A · Cadena anterior", 2, "Lunes"],
      ["2027-02-15", "Test 1 · tren inferior", 2, "Lunes"],
    ]);
    expect(new Set(m.days.map((d) => d.key)).size).toBe(m.days.length);
    expect(m.days.every((d) => d.type === "STRENGTH" && d.durationMin === 75)).toBe(true);
    const rows = m.days[0].blocks[0].kind === "table" ? m.days[0].blocks[0].rows : [];
    expect(rows[0]).toMatchObject({ exercise: "Hack squat (o sentadilla en máquina)", sets: "3", load: "8-10", rir: "2", rest: "2:30", ramp: false });
    expect(rows[0].how).toMatch(/Tempo 3-1-1-0/);
    expect(rows[1]).toMatchObject({ exercise: "Core A: plancha", load: "40 s + 15", rir: "", how: "" });
  });
  it("las tablas que no son de ejercicios (tests) quedan como texto", () => {
    expect(m.days[3].blocks).toEqual([{ kind: "text", title: null, text: "Prueba · Carga\nSentadilla · 60 kg" }]);
  });
  it("textos del principio y del final como introducción y anexos", () => {
    expect(m.intro.map((s) => s.title)).toContain("Cómo leer tu plan");
    expect(m.intro.find((s) => s.title === "Cómo leer tu plan")?.text).toMatch(/RIR/);
    expect(m.annexes[0]).toMatchObject({ title: "Medidas (semanas 1 y 12)" });
  });
  it("NO importa el nombre ni el entrenador de la cabecera y avisa", () => {
    const all = JSON.stringify(m);
    expect(all).not.toMatch(/Persona Ficticia|Entrenadora"/);
    expect(m.warnings.join(" ")).toMatch(/nombre en la cabecera/);
  });
  it("lo que no es un plan devuelve null", () => {
    expect(parsePlanDocx(docx(p("Hola") + p("Sin fechas")))).toBeNull();
    expect(parsePlanDocx(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(parsePlanDocx(zipSync({ "otra.txt": strToU8("x") }))).toBeNull();
  });
});
