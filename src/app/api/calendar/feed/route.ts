import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { auditContext, recordEvent } from "@/lib/security/audit";
import { createFeed, feedStatus, revokeFeeds } from "@/lib/planning/feed-service";

/** Enlace del calendario .ics: estado, crear (sustituye al anterior) y revocar. */
export const GET = route(async () => {
  const user = await requireUser();
  return feedStatus(user.id);
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const token = await createFeed(user.id);
  await recordEvent(user.id, "SHARE_LINK_CREATED", auditContext(req.headers), "calendario .ics");
  const base = (env().AUTH_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  // El token solo se muestra ahora: en la BD queda su hash.
  return { url: `${base}/api/calendar/ics/${token}` };
});

export const DELETE = route(async () => {
  const user = await requireUser();
  await revokeFeeds(user.id);
  return { ok: true };
});
