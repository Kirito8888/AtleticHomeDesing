import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { historyView } from "@/lib/finance/history-view";

/** `GET /api/finance/history?kind&account&month&from&to&limit` · Lista filtrada del historial con saldo. Solo los datos del usuario de la sesión. */
export const GET = route(async (req) => {
  const user = await requireUser();
  const q = new URL(req.url).searchParams;
  const get = (k: string) => q.get(k) ?? undefined;
  return historyView(user.id, { kind: get("kind"), account: get("account"), month: get("month"), from: get("from"), to: get("to"), limit: get("limit") });
});
