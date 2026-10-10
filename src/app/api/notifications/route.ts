import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { listInbox, markAllRead } from "@/lib/push/inbox";

/** v1.8 · Centro de notificaciones. */
export const GET = route(async () => {
  const user = await requireUser();
  return listInbox(user.id);
});

/** Marcar todas como leídas. */
export const POST = route(async () => {
  const user = await requireUser();
  const { count } = await markAllRead(user.id);
  return { read: count };
});
