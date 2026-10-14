import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { feeUpdateSchema } from "@/lib/clubs/fees";
import { setFeeStatus } from "@/lib/clubs/service";

export const PATCH = route(async (req, ctx: RouteContext<"/api/clubs/[id]/fees/[feeId]">) => {
  const user = await requireUser();
  const { id, feeId } = await ctx.params;
  const { status, paidAt } = await parseBody(req, feeUpdateSchema);
  const fee = await setFeeStatus(user, id, feeId, status, paidAt);
  return { id: fee.id, status: fee.status };
});
