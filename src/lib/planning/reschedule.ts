// Recolocar una sesión que no se hizo (v1.6). Puro: propone días, no mueve nada.
export type RescheduleInput = {
  today: string;
  horizon: number;
  isThrow: boolean;
  /** Fechas con otras sesiones de lanzamiento (hechas o planificadas). */
  throwDates: string[];
  minHours: number;
  examDates: string[];
  symptomDates: string[];
  /** Nº de sesiones planificadas por día. */
  busy: Record<string, number>;
};
export type RescheduleOption = { date: string; notes: string[]; score: number };

const add = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 864e5;

/** Hasta 3 días de los próximos `horizon`: nunca rompe las horas entre lanzamientos; penaliza exámenes, síntomas y días ocupados. */
export function rescheduleOptions(i: RescheduleInput): RescheduleOption[] {
  const exams = new Set(i.examDates);
  const symptoms = new Set(i.symptomDates);
  const out: RescheduleOption[] = [];
  for (let k = 0; k < i.horizon; k++) {
    const date = add(i.today, k);
    if (i.isThrow && i.throwDates.some((t) => daysBetween(t, date) * 24 < i.minHours)) continue;
    const notes: string[] = [];
    let score = k * 0.1; // antes es mejor
    if (exams.has(date)) {
      notes.push("día de examen");
      score += 3;
    } else if (exams.has(add(date, 1))) {
      notes.push("víspera de examen");
      score += 2;
    }
    if (symptoms.has(date)) {
      notes.push("días con síntomas previstos");
      score += 1.5;
    }
    if (i.busy[date]) {
      notes.push(`ya hay ${i.busy[date]} sesión${i.busy[date] > 1 ? "es" : ""}`);
      score += i.busy[date];
    }
    out.push({ date, notes, score: Math.round(score * 10) / 10 });
  }
  return out.sort((a, b) => a.score - b.score || a.date.localeCompare(b.date)).slice(0, 3);
}
