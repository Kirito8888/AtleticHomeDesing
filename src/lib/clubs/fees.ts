// Cuotas internas del club (v2.0): apunte contable manual, sin pasarela de pago. Puro.
import { z } from "zod";

/** «25», «25,5», «25.50», «1.250,00» → céntimos; null si no es un importe válido. */
export function parseAmount(raw: string): number | null {
  let s = raw.trim().replace(/\s|€/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  return Number.isSafeInteger(cents) && cents > 0 && cents <= 100_000_00 ? cents : null;
}

export function formatAmount(cents: number, currency = "EUR"): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(cents / 100);
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida");

export const feeCreateSchema = z.object({
  memberId: z.string().min(1),
  concept: z.string().trim().min(1, "Falta el concepto").max(80),
  /** En euros, como lo escribe una persona («25,50»). */
  amount: z.string().refine((v) => parseAmount(v) !== null, "Importe no válido"),
  dueDate: day,
});

export const feeUpdateSchema = z.object({
  status: z.enum(["PENDING", "PAID"]),
  paidAt: day.optional(),
});

export interface FeeLike {
  amountCents: number;
  status: "PENDING" | "PAID";
  dueDate: string;
}

export function feeSummary(fees: FeeLike[], today: string) {
  const pending = fees.filter((f) => f.status === "PENDING");
  return {
    paidCents: fees.filter((f) => f.status === "PAID").reduce((a, f) => a + f.amountCents, 0),
    pendingCents: pending.reduce((a, f) => a + f.amountCents, 0),
    overdue: pending.filter((f) => f.dueDate < today).length,
  };
}
