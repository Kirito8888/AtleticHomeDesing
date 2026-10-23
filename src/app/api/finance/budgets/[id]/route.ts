import { ApiError, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { isMonth } from "@/lib/finance/budgets";
import { deleteMonthlyBudget } from "@/lib/finance/budgets-service";

/** Quita el presupuesto mensual desde `?month=AAAA-MM` en adelante. */
export const DELETE = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const month = req.nextUrl.searchParams.get("month");
  if (!isMonth(month)) throw new ApiError(400, "Mes no válido (AAAA-MM)");
  return deleteMonthlyBudget(user.id, id, month);
});
