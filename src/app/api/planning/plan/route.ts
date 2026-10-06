import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { planOverview } from "@/lib/planning/plan-import/service";

/** Bloques del plan importado con sus versiones. */
export const GET = route(async () => {
  const user = await requireUser();
  return planOverview(user.id);
});
