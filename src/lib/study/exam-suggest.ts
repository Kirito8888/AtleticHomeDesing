// v2.11 B2 (N11) · Fecha de examen sugerida desde los exámenes del horario (ClassSlot EXAM). Puro.

export interface ExamSuggestion {
  /** AAAA-MM-DD */
  date: string;
  /** Asignatura del examen en el horario (puede no ser la de la ficha). */
  subject: string;
  /** true si el nombre de la asignatura coincide con el del horario. */
  matched: boolean;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

function sameSubject(a: string, b: string) {
  const x = norm(a);
  const y = norm(b);
  // Inclusión por palabras completas: «Química» no coincide con «Bioquímica».
  return x.length > 0 && y.length > 0 && (` ${x} `.includes(` ${y} `) || ` ${y} `.includes(` ${x} `));
}

/** Próximo examen del horario (desde `today`), priorizando el que coincide con el nombre; si no, el más cercano. */
export function suggestExamDate(moduleName: string, exams: Array<{ subject: string; date: string }>, today: string): ExamSuggestion | null {
  const future = exams.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const hit = future.find((e) => sameSubject(moduleName, e.subject));
  if (hit) return { date: hit.date, subject: hit.subject, matched: true };
  const next = future[0];
  return next ? { date: next.date, subject: next.subject, matched: false } : null;
}
