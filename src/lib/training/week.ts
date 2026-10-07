/** Estado de cada día L–D de una semana a partir de sus sesiones (fechas ISO). */
export type WeekDay = { date: string; label: string; done: number; planned: number; skipped: number; state: "done" | "pending" | "missed" | "skipped" | "rest" };

const LABELS = ["L", "M", "X", "J", "V", "S", "D"];

export function weekGrid(sessions: Array<{ date: string; status: string }>, monday: string, today: string): WeekDay[] {
  return LABELS.map((label, i) => {
    const date = new Date(Date.parse(`${monday}T00:00:00Z`) + i * 864e5).toISOString().slice(0, 10);
    const day = sessions.filter((s) => s.date === date);
    const done = day.filter((s) => s.status === "COMPLETED").length;
    const planned = day.filter((s) => s.status === "PLANNED").length;
    const skipped = day.filter((s) => s.status === "SKIPPED").length;
    const state = done ? "done" : planned ? (date < today ? "missed" : "pending") : skipped ? "skipped" : "rest";
    return { date, label, done, planned, skipped, state };
  });
}
