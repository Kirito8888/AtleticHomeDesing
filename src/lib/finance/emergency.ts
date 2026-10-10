/** v1.8 · Fondo de emergencia y proyección de ahorro. Puro. */
export type MonthFlow = { month: string; incomeCents: number; expenseCents: number };

export function emergencyFund(closedMonths: MonthFlow[], liquidCents: number, targetMonths: number) {
  // Solo meses con movimientos: un mes vacío (antes de empezar a usar LifeOS) no es «gasto 0»
  const used = closedMonths.filter((m) => m.incomeCents || m.expenseCents);
  if (!used.length) return null;
  const avgExpense = Math.round(used.reduce((a, m) => a + m.expenseCents, 0) / used.length);
  const avgNet = Math.round(used.reduce((a, m) => a + m.incomeCents - m.expenseCents, 0) / used.length);
  const targetCents = avgExpense * targetMonths;
  return {
    months: used.length,
    avgExpenseCents: avgExpense,
    avgNetCents: avgNet,
    targetCents,
    coveredMonths: avgExpense > 0 ? Math.round((liquidCents / avgExpense) * 10) / 10 : null,
    missingCents: Math.max(0, targetCents - liquidCents),
    // Al ritmo medio, cuántos meses faltan para completarlo (null si no se ahorra)
    monthsToTarget: liquidCents >= targetCents ? 0 : avgNet > 0 ? Math.ceil((targetCents - liquidCents) / avgNet) : null,
    in12mCents: liquidCents + avgNet * 12,
  };
}
