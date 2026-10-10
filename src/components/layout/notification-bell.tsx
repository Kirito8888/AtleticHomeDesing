import Link from "next/link";
import { Bell } from "lucide-react";

/** v1.8 · Campana con las notificaciones sin leer (servidor; sin JavaScript extra). */
export function NotificationBell({ unread }: { unread: number }) {
  return (
    <Link href="/notifications" aria-label={unread ? `Notificaciones: ${unread} sin leer` : "Notificaciones"} className="relative inline-flex size-9 items-center justify-center rounded-md hover:bg-accent">
      <Bell className="size-4" />
      {unread ? (
        <span aria-hidden="true" className="absolute top-1 right-1 min-w-4 rounded-full bg-destructive px-1 text-[10px] leading-4 font-semibold text-white tabular-nums">
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
