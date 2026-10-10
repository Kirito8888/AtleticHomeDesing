// v1.7 · Finanzas: presupuesto de la temporada deportiva con previsión y avisos de subida de precio de
// suscripciones. Puro (sin BD).
import { z } from "zod";

export const SEASON_LINES = { license: "Licencia y seguro", gear: "Material", travel: "Viajes", entries: "Inscripciones", physio: "Fisio y salud", other: "Otros" } as const;
export type SeasonLine = keyof typeof SEASON_LINES;

const cents = z.number().int().min(0).max(100_000_00);
export const seasonBudgetSchema = z.object({
  season: z.number().int().min(2000).max(2100),
  lines: z.partialRecord(z.enum(Object.keys(SEASON_LINES) as [SeasonLine, ...SeasonLine[]]), cents),
  perCompetitionCents: cents.default(0),
});
export type SeasonBudgetInput = z.infer<typeof seasonBudgetSchema>;

/**
 * 25 · Previsión del gasto deportivo de la temporada (año natural). Se toma la mayor de dos:
 *  - lineal: lo gastado al ritmo actual hasta el 31 de diciembre (con ≥ 30 días de datos);
 *  - por calendario: lo gastado + las competiciones que quedan × coste medio por competición.
 */
export function seasonForecast(o: { lines: Partial<Record<SeasonLine, number>>; perCompetitionCents: number; spentCents: number; incomeCents: number; upcomingCompetitions: number; today: string; season: number }) {
  const plannedCents = Object.values(o.lines).reduce<number>((a, b) => a + (b ?? 0), 0);
  const year = Number(o.today.slice(0, 4));
  let linearCents: number | null = null;
  if (o.season === year) {
    const start = Date.UTC(year, 0, 1);
    const elapsed = Math.floor((Date.parse(`${o.today}T00:00:00Z`) - start) / 864e5) + 1;
    const length = (Date.UTC(year + 1, 0, 1) - start) / 864e5;
    if (elapsed >= 30) linearCents = Math.round((o.spentCents * length) / elapsed);
  }
  const calendarCents = o.spentCents + (o.season >= year ? o.upcomingCompetitions * o.perCompetitionCents : 0);
  const forecastCents = o.season < year ? o.spentCents : Math.max(linearCents ?? 0, calendarCents);
  return {
    plannedCents,
    spentCents: o.spentCents,
    linearCents,
    calendarCents,
    forecastCents,
    usedPct: plannedCents ? Math.round((o.spentCents / plannedCents) * 100) : null,
    overBudgetCents: plannedCents ? Math.max(0, forecastCents - plannedCents) : 0,
    balanceCents: o.incomeCents - forecastCents,
  };
}

// 27 · Subidas de precio de suscripciones ---------------------------------------------------------
const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Cargos de los últimos 60 días que corresponden a una suscripción (por `subscriptionId` o porque el
 * concepto o el beneficiario contienen su nombre) y que superan el importe guardado.
 */
export function priceAlerts(subs: Array<{ id: string; name: string; amountCents: number; isActive: boolean }>, charges: Array<{ id: string; subscriptionId: string | null; description: string; payee: string | null; date: string; amountCents: number }>, today: string) {
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - 60 * 864e5).toISOString().slice(0, 10);
  const out: Array<{ subscriptionId: string; name: string; storedCents: number; chargedCents: number; date: string; pct: number }> = [];
  for (const s of subs.filter((x) => x.isActive)) {
    const key = norm(s.name);
    if (key.length < 3) continue;
    const hits = charges
      .filter((c) => c.date >= from && (c.subscriptionId === s.id || (!c.subscriptionId && (norm(c.description).includes(key) || norm(c.payee ?? "").includes(key)))))
      .sort((a, b) => b.date.localeCompare(a.date));
    const last = hits[0];
    // Margen de 1 céntimo por redondeos
    if (last && last.amountCents > s.amountCents + 1) out.push({ subscriptionId: s.id, name: s.name, storedCents: s.amountCents, chargedCents: last.amountCents, date: last.date, pct: Math.round(((last.amountCents - s.amountCents) / s.amountCents) * 1000) / 10 });
  }
  return out;
}
