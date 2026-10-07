import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getPrefs, updatePrefs } from "@/lib/rules/prefs-service";

/** «Mis reglas»: umbrales de avisos, redondeo de kg, recordatorios, checklist… */
export const GET = route(async () => {
  const user = await requireUser();
  return getPrefs(user.id);
});

export const PATCH = route(async (req) => {
  const user = await requireUser();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  return updatePrefs(user.id, body);
});
