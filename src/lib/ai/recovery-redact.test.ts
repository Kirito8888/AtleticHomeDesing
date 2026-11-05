import { describe, expect, it } from "vitest";

import { mentionsRecovery, recoveryValues, redactCoachReport, redactText } from "./recovery-redact";

describe("recovery-redact", () => {
  it("quita frases con términos de recuperación (mayúsculas y tildes)", () => {
    const r = redactText("La carga sube. Tu VFC está baja. Duermes poco y el SUEÑO empeora. TSB en -22.");
    expect(r.removed).toBe(true);
    expect(r.text).toBe("La carga sube. TSB en -22.");
  });
  it("tapa valores de recuperación con coma o punto decimal, pero no un TSS igual", () => {
    const snap = { load: { totalTss: 60 }, recovery: { weekAvg: { hrv: 77.7, rhr: 43, x: 60 } } };
    const values = recoveryValues(snap);
    expect(values).toContain("77.7");
    expect(values).toContain("43");
    expect(values).not.toContain("60");
    expect(mentionsRecovery("Subió a 77,7 ms", values)).toBe(true);
    expect(mentionsRecovery("Tienes 43 pulsaciones", values)).toBe(true);
    expect(mentionsRecovery("TSS total 60", values)).toBe(false);
    expect(mentionsRecovery("Hiciste 143 saltos", values)).toBe(false);
  });
  it("informe: fuera RECOVERY/SLEEP y las frases que citan recuperación", () => {
    const { report, redacted } = redactCoachReport({
      summary: "Semana dura. Recuperación incompleta.",
      keyFindings: ["Rampa alta", "VFC baja"],
      recommendations: [
        { area: "SLEEP", action: "Duerme 8 h", rationale: "x", priority: "HIGH" },
        { area: "LOAD", action: "Baja el volumen. Mira tu FC en reposo.", rationale: "Rampa 7", priority: "HIGH" },
        { area: "LOAD", action: "Descansa mañana", rationale: "x", priority: "LOW" },
      ],
      nextWeek: { notes: "Tapering. Vigila el descanso." },
      dataGaps: ["Falta sueño"],
    });
    expect(redacted).toBe(true);
    expect(report.summary).toBe("Semana dura.");
    expect(report.keyFindings).toEqual(["Rampa alta"]);
    expect(report.recommendations).toEqual([{ area: "LOAD", action: "Baja el volumen.", rationale: "Rampa 7", priority: "HIGH" }]);
    expect(report.nextWeek.notes).toBe("Tapering.");
    expect(report.dataGaps).toEqual([]);
  });
  it("un texto limpio queda intacto", () => {
    const input = { summary: "Buena semana de carga.", keyFindings: ["CTL +3"], recommendations: [{ area: "LOAD", action: "Mantén", rationale: "CTL", priority: "LOW" }] };
    const { report, redacted } = redactCoachReport(input);
    expect(redacted).toBe(false);
    expect(report).toEqual(input);
  });
});
