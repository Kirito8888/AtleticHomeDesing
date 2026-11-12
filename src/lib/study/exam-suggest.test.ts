import { describe, expect, it } from "vitest";

import { suggestExamDate } from "./exam-suggest";

const T = "2026-11-12";

describe("suggestExamDate (N11)", () => {
  it("prioriza la coincidencia por nombre aunque haya otro examen antes", () => {
    const r = suggestExamDate("Bioquímica", [{ subject: "Física", date: "2026-12-01" }, { subject: "BIOQUIMICA II", date: "2026-12-20" }], T);
    expect(r).toEqual({ date: "2026-12-20", subject: "BIOQUIMICA II", matched: true });
  });

  it("ignora tildes, mayúsculas y espacios; acepta inclusión en ambos sentidos", () => {
    expect(suggestExamDate("  fisica ", [{ subject: "Física general", date: "2026-12-01" }], T)?.matched).toBe(true);
    expect(suggestExamDate("Física general avanzada", [{ subject: "Física", date: "2026-12-01" }], T)?.matched).toBe(true);
  });

  it("no confunde «Química» con «Bioquímica» (palabras completas)", () => {
    const r = suggestExamDate("Bioquímica II", [{ subject: "Química", date: "2026-11-22" }], T);
    expect(r).toEqual({ date: "2026-11-22", subject: "Química", matched: false });
  });

  it("descarta exámenes pasados y elige el más cercano entre los que coinciden", () => {
    const r = suggestExamDate("Álgebra", [{ subject: "Álgebra", date: "2026-10-01" }, { subject: "Álgebra", date: "2027-01-20" }, { subject: "Álgebra", date: "2026-12-05" }], T);
    expect(r?.date).toBe("2026-12-05");
  });

  it("hoy cuenta; sin coincidencia propone el próximo examen marcado como no coincidente", () => {
    expect(suggestExamDate("Química", [{ subject: "Física", date: T }], T)).toEqual({ date: T, subject: "Física", matched: false });
  });

  it("sin exámenes futuros no hay sugerencia", () => {
    expect(suggestExamDate("Química", [], T)).toBeNull();
    expect(suggestExamDate("Química", [{ subject: "Química", date: "2026-01-01" }], T)).toBeNull();
  });
});
