import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { listRules } from "@/lib/finance/category-rules-service";

export const GET = route(async () => {
  const user = await requireUser();
  return listRules(user.id);
});
