import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { buildPdf } from "@/test/pdf-fixture";
import { mesoPdf, versionsPdf } from "@/test/plan-fixtures";

import { groupLines } from "./extract";
import { parsePlanUpload, PlanImportError, pdfsFromZip } from "./files";
import { inferDate, parseDayHeader, sessionKind } from "./parse";

const rowsOf = (d: { blocks: Array<{ kind: string; rows?: unknown[] }> }) => d.blocks.flatMap((b) => (b.kind === "table" ? (b.rows as never[]) : []));

describe("importar planificación: PDF «día a día»", () => {
  it("reconoce el bloque, las semanas, los días y sus tablas", async () => {
    const { mesos, skipped } = await parsePlanUpload([{ name: "M5.pdf", bytes: mesoPdf() }]);
    expect(skipped).toEqual([]);
    const [m] = mesos;
    expect(m).toMatchObject({ code: "M5", name: "Bloque de prueba", start: "2026-10-26", end: "2026-11-22", version: "7", variants: [], defaultVariant: null });
    expect(m.intro.map((p) => p.title)).toContain("Qué busco en este mesociclo");
    expect(m.weeks.map((w) => [w.number, w.title, w.start, w.end])).toEqual([
      [1, "Entrada", "2026-10-26", "2026-11-01"],
      [2, "Carga", "2026-11-02", "2026-11-08"],
    ]);
    expect(m.days.map((d) => [d.key, d.date, d.weekday, d.durationMin, d.type])).toEqual([
      ["M5|-|2026-10-26|1", "2026-10-26", "LUNES", 109, "MIXED"],
      ["M5|-|2026-10-27|1", "2026-10-27", "MARTES", 139, "STRENGTH"],
      ["M5|-|2026-10-31|1", "2026-10-31", "SÁBADO", 28, "TRACK"],
      ["M5|-|2026-11-02|1", "2026-11-02", "LUNES", 60, "MIXED"],
    ]);
    // Cabecera de día en dos líneas: el título no arrastra la duración.
    expect(m.days[0].title).toBe("Snatch ligero + JABALINA");
    expect(m.days[0].weekTitle).toBe("Entrada");

    const monday = m.days[0];
    expect(monday.blocks[0]).toEqual({ kind: "text", title: "Calentamiento (8 min)", text: "5 min de trote suave y skipping bajo 2 × 15 m." });
    const rows = rowsOf(monday) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({ ramp: true, sets: "1 × 3 y 1 × 3", load: "30 % y 60 %" });
    expect(rows[1]).toEqual({ exercise: "Snatch colgante", sets: "3 × 2", load: "70 %", rir: "2", rest: "3 min", how: "Rápido y preciso", ramp: false });
    // Celdas en varias líneas; «A dem» + «anda» se une sin espacio en la columna estrecha.
    expect(rows[2]).toMatchObject({ exercise: "Lanzamientos con jabalina 700 g", sets: "5 lanzamientos", rest: "A demanda", how: "Foco: un solo punto técnico en cada intento" });
    // Fila partida por el salto de página: sigue en la misma fila y la tabla continúa.
    expect(rows[3]).toMatchObject({ exercise: "Copenhagen", how: "Anoto cómo me encuentro (0-10)" });
    expect(rows[4]).toMatchObject({ exercise: "Ulnar sliders", sets: "2 × 10" });
    expect(monday.blocks.filter((b) => b.kind === "table")).toHaveLength(1);
    expect(monday.blocks.at(-1)).toEqual({ kind: "why", text: "Texto de ejemplo para el apartado de explicación." });

    expect(rowsOf(m.days[1])).toEqual([{ exercise: "Sentadilla frontal", sets: "4 × 4", load: "83 %", rir: "2", rest: "3-4 min", how: "Codos altos", ramp: false }]);
    expect(m.days[2].blocks).toEqual([{ kind: "text", title: null, text: "Nado suave 20 min." }]);
    expect(m.days[3].blocks.map((b) => b.kind)).toEqual(["table"]);
    expect(m.annexes).toEqual([{ title: "Anexo B · Mi tabla de RM (kg)", text: "Sentadilla frontal 100" }]);
    // Semanas 3 y 4 sin días: aviso de cobertura.
    expect(m.warnings).toEqual(["M5: la semana del 2026-11-09 no tiene días.", "M5: la semana del 2026-11-16 no tiene días."]);
  });

  it("versiones A/B con subvariantes: B por defecto y claves distintas por versión", async () => {
    const { mesos } = await parsePlanUpload([{ name: "M9.pdf", bytes: versionsPdf() }]);
    const [m] = mesos;
    expect(m.days.map((d) => [d.variant, d.week, d.date, d.competition])).toEqual([
      ["A", 1, "2027-02-15", false],
      ["A-V", 2, "2027-02-26", true],
      ["A-S", 2, "2027-02-27", true],
      ["B", 1, "2027-02-15", false],
      ["B", 2, "2027-02-22", false],
    ]);
    expect(m.variants).toEqual([
      { code: "A-V", label: "Versión A · Variante 1: mi jabalina es el VIERNES 26" },
      { code: "A-S", label: "Versión A · Variante 2: mi jabalina es el SÁBADO 27" },
      { code: "B", label: "Versión B · Transformación: carga" },
    ]);
    expect(m.defaultVariant).toBe("B");
    expect(new Set(m.days.map((d) => d.key)).size).toBe(5);
  });

  it("omite los PDF que no son «día a día» y lo que no es PDF", async () => {
    const other = buildPdf([[{ x: 57, y: 811, text: "Temporada 2026-27 · Estructura del macrociclo" }, { x: 63, y: 700, text: "Resumen" }]]);
    const r = await parsePlanUpload([
      { name: "estructura.pdf", bytes: other },
      { name: "notas.txt", bytes: new TextEncoder().encode("hola") },
    ]);
    expect(r.mesos).toEqual([]);
    expect(r.skipped.map((s) => s.name).sort()).toEqual(["estructura.pdf", "notas.txt"]);
  });
});

describe("importar planificación: zip", () => {
  it("lee los PDF del zip (también en carpetas) e ignora el resto", async () => {
    const zip = zipSync({ "Plan/M5.pdf": mesoPdf(), "Plan/M9.pdf": versionsPdf(), "Plan/leeme.txt": new TextEncoder().encode("x"), "__MACOSX/Plan/._M5.pdf": new Uint8Array(4) });
    const r = await parsePlanUpload([{ name: "plan.zip", bytes: zip }]);
    expect(r.mesos.map((m) => m.code)).toEqual(["M5", "M9"]);
  });

  it("límites: demasiadas entradas, PDF enorme declarado y zip dañado", () => {
    const many: Record<string, Uint8Array> = {};
    for (let i = 0; i < 41; i++) many[`p${i}.pdf`] = new Uint8Array([1]);
    expect(() => pdfsFromZip(zipSync(many))).toThrow(/más de 40/);

    // Zip bomb: 25 MB de ceros comprimen a casi nada, pero el tamaño declarado delata.
    const bomb = zipSync({ "grande.pdf": new Uint8Array(25 * 1024 * 1024) }, { level: 9 });
    expect(bomb.length).toBeLessThan(100_000);
    expect(() => pdfsFromZip(bomb)).toThrow(PlanImportError);

    expect(() => pdfsFromZip(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0]))).toThrow(/No se pudo abrir/);
  });
});

describe("piezas del parser", () => {
  const inM9 = (dd: number, mm: number) => inferDate(dd, mm, "2027-02-15", "2027-02-28");

  it("códigos de día: semana, versión, subvariante, día de competición relativo", () => {
    expect(parseDayHeader("M5 · S1 · LUNES 26/10 · Algo · ~10 min (coche)", (d, m) => inferDate(d, m, "2026-10-26", "2026-11-22"))).toMatchObject({ variant: null, week: 1, date: "2026-10-26", durationMin: 10 });
    expect(parseDayHeader("M9 · A·S2-V · VIERNES 26/02 · X", inM9)).toMatchObject({ variant: "A-V", week: 2 });
    expect(parseDayHeader("M10 · B · LUNES 01/03 · X", (d, m) => inferDate(d, m, "2027-03-01", "2027-03-07"))).toMatchObject({ variant: "B", week: null });
    expect(parseDayHeader("M12 · S2·A · MIÉRCOLES 21/04 · X", (d, m) => inferDate(d, m, "2027-04-12", "2027-05-16"))).toMatchObject({ variant: "A", week: 2 });
    expect(parseDayHeader("M13 · S1·sáb · JUEVES 20/05 · X", (d, m) => inferDate(d, m, "2027-05-17", "2027-06-13"))).toMatchObject({ variant: "sáb", week: 1 });
    expect(parseDayHeader("M16 · C·D−5 · D−5 · 5 días antes · Snatch", inM9)).toMatchObject({ variant: "C", relDay: -5, date: null, title: "5 días antes · Snatch" });
    expect(parseDayHeader("M16 · C·D · D · día de competición · EUROPEO SUB-23 · jabalina", inM9)).toMatchObject({ relDay: 0, competition: true });
    expect(parseDayHeader("M9 · S1 · LUNES 15/09 · fuera del bloque", inM9)).toBeNull();
    expect(parseDayHeader("M9 · ¿? · LUNES 15/02 · X", inM9)).toBeNull();
  });

  it("año de las fechas en bloques que cruzan el año", () => {
    expect(inferDate(28, 12, "2026-12-21", "2027-01-10")).toBe("2026-12-28");
    expect(inferDate(3, 1, "2026-12-21", "2027-01-10")).toBe("2027-01-03");
    expect(inferDate(30, 2, "2027-02-15", "2027-02-28")).toBeNull();
  });

  it("tipo de sesión por el título", () => {
    expect(sessionKind("Sentadilla frontal + tren superior", false)).toBe("STRENGTH");
    expect(sessionKind("Técnica sin lanzar → JABALINA", false)).toBe("TECHNICAL");
    expect(sessionKind("Snatch ligero → aceleraciones + JABALINA", false)).toBe("MIXED");
    expect(sessionKind("Piscina (mañana)", false)).toBe("TRACK");
    expect(sessionKind("GP DE INVIERNO", true)).toBe("TECHNICAL");
  });

  it("agrupa trozos en líneas y separa cabecera y pie", () => {
    const lines = groupLines(
      [
        { x: 200, y: 500.4, str: "b", size: 8 },
        { x: 100, y: 500, str: "a", size: 8 },
        { x: 57, y: 811, str: "cabecera", size: 8 },
        { x: 57, y: 31, str: "pie", size: 8 },
      ],
      1,
      842,
    );
    expect(lines.map((l) => [l.role, l.items.map((i) => i.str).join("")])).toEqual([
      ["header", "cabecera"],
      ["body", "ab"],
      ["footer", "pie"],
    ]);
  });
});
