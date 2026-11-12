import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { financeOverview } from "@/lib/finance/overview";

/** `GET /api/finance/overview` · Datos variables de `/finance` (cuentas, categorías, mes, últimos 12 movimientos). Solo los del usuario de la sesión. */
export const GET = route(async () => financeOverview((await requireUser()).id));
