// v2.7.0 B4 (S1) · Salvaguarda del texto libre de la IA: quien no tiene el ámbito RECOVERY no lee
// sueño, VFC, FC en reposo, DOMS, readiness ni descanso, ni aunque el modelo los cite. Puro: sin BD ni IA.
//
// Se tapa por frase completa (no por palabra): una frase que nombra la recuperación o cita uno de sus
// valores se quita entera. Preferimos tapar de más («día de descanso» también cae) que dejar pasar algo.

/** Términos de recuperación, sobre texto en minúsculas y sin tildes. */
export const RECOVERY_TERMS =
  /\b(vfc|hrv|rmssd|readiness|suen\w*|dorm\w*|descans\w*|recuper\w*|fc en reposo|frecuencia cardiaca en reposo|rhr|doms|agujetas|siestas?|sleep\w*)\b/;

const REDACTED_AREAS = new Set(["RECOVERY", "SLEEP"]);
export const REDACTED_SUMMARY =
  "Parte del análisis requiere el ámbito de recuperación.";

const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const numbersIn = (v: unknown, out: Set<string>) => {
  if (typeof v === "number" && Number.isFinite(v)) out.add(String(v));
  else if (Array.isArray(v)) v.forEach((x) => numbersIn(x, out));
  else if (v && typeof v === "object")
    Object.values(v).forEach((x) => numbersIn(x, out));
  return out;
};

/**
 * Valores numéricos de `snapshot.recovery` que no aparecen en el resto del snapshot (si un número
 * también es, p. ej., un TSS, citarlo no revela nada de la recuperación).
 */
export function recoveryValues(snapshot: unknown): string[] {
  if (!snapshot || typeof snapshot !== "object" || !("recovery" in snapshot))
    return [];
  const { recovery, ...rest } = snapshot as Record<string, unknown>;
  const others = numbersIn(rest, new Set());
  return [...numbersIn(recovery, new Set())].filter((n) => !others.has(n));
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const valuePattern = (values: string[]) =>
  values.length
    ? new RegExp(
        `(?<![\\d.,])(?:${values.map((v) => escape(v).replace("\\.", "[.,]")).join("|")})(?![\\d]|[.,]\\d)`,
      )
    : null;

/** ¿Cita la recuperación? (término o valor) */
export function mentionsRecovery(text: string, values: string[] = []): boolean {
  const pat = valuePattern(values);
  return RECOVERY_TERMS.test(fold(text)) || (pat?.test(text) ?? false);
}

/** Quita las frases (o líneas) que citan la recuperación. */
export function redactText(
  text: string,
  values: string[] = [],
): { text: string; removed: boolean } {
  const pat = valuePattern(values);
  let removed = false;
  const lines = text.split("\n").map((line) => {
    const parts = line.split(/(?<=[.!?;:])\s+/);
    const kept = parts.filter((p) => {
      const hit = RECOVERY_TERMS.test(fold(p)) || (pat?.test(p) ?? false);
      if (hit) removed = true;
      return !hit;
    });
    return { kept: kept.join(" "), dropped: kept.length < parts.length };
  });
  // Una línea que quedó vacía al tapar se quita; las vacías originales (párrafos markdown) se conservan
  const out = lines
    .filter((l) => !(l.dropped && !l.kept.trim()))
    .map((l) => l.kept);
  return { text: out.join("\n").trim(), removed };
}

type Rec = {
  area?: unknown;
  action?: unknown;
  rationale?: unknown;
  [k: string]: unknown;
};
type Report = {
  summary?: unknown;
  keyFindings?: unknown;
  recommendations?: unknown;
  nextWeek?: unknown;
  dataGaps?: unknown;
  [k: string]: unknown;
};

/**
 * Informe del coach sin recuperación: fuera las recomendaciones de RECOVERY/SLEEP y las frases que la
 * citan en resumen, hallazgos, acciones, motivos, notas de la próxima semana y huecos de datos.
 */
export function redactCoachReport<T extends Report>(
  report: T,
  values: string[] = [],
): { report: T; redacted: boolean } {
  let redacted = false;
  const clean = (s: unknown) => {
    if (typeof s !== "string") return s;
    const r = redactText(s, values);
    if (r.removed) redacted = true;
    return r.text;
  };
  const cleanList = (xs: unknown) =>
    Array.isArray(xs)
      ? xs.map(clean).filter((x) => typeof x !== "string" || x.length > 0)
      : xs;

  const out: Report = { ...report };
  if ("summary" in report) {
    const s = clean(report.summary);
    out.summary = typeof s === "string" && !s ? REDACTED_SUMMARY : s;
  }
  if ("keyFindings" in report) out.keyFindings = cleanList(report.keyFindings);
  if ("dataGaps" in report) out.dataGaps = cleanList(report.dataGaps);
  if (report.nextWeek && typeof report.nextWeek === "object") {
    const nw = report.nextWeek as Record<string, unknown>;
    out.nextWeek = { ...nw, notes: clean(nw.notes) };
  }
  if (Array.isArray(report.recommendations)) {
    out.recommendations = (report.recommendations as Rec[]).flatMap((r) => {
      if (r && typeof r === "object" && REDACTED_AREAS.has(String(r.area))) {
        redacted = true;
        return [];
      }
      const next = {
        ...r,
        action: clean(r.action),
        rationale: clean(r.rationale),
      };
      if (next.action === "") {
        redacted = true;
        return [];
      }
      return [next];
    });
  }
  return { report: out as T, redacted };
}
