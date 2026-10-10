import Link from "next/link";

import { MarkAllRead, SnoozeButton } from "@/components/layout/mark-read";
import { PageHeader } from "@/components/page-header";
import { pageUser } from "@/lib/auth/page";
import { listInbox } from "@/lib/push/inbox";
import { cn } from "@/lib/utils";

export const metadata = { title: "Notificaciones · Atlenza" };

const when = (d: Date) => new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(d);

/** v1.8 · Lo que Atlenza te ha avisado (60 días), aunque no tengas las notificaciones push activadas. */
export default async function NotificationsPage() {
  const user = await pageUser();
  const items = await listInbox(user.id);
  const unread = items.filter((i) => !i.readAt).length;
  return (
    <>
      <PageHeader title="Notificaciones" description="Los avisos de los últimos 60 días. Las horas de silencio se ajustan en Ajustes → Notificaciones." />
      <MarkAllRead unread={unread} />
      {items.length ? (
        <ul className="grid max-w-xl gap-2 text-sm" aria-label="Notificaciones">
          {items.map((n) => (
            <li key={n.id} className={cn("rounded-md border p-3", !n.readAt && "border-primary/50 bg-primary/5")}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{n.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{when(n.sentAt)}</span>
              </div>
              {n.body ? <p className="text-muted-foreground">{n.body}</p> : null}
              <div className="mt-1 flex gap-3">
                {n.url ? (
                  <Link href={n.url} className="text-xs font-medium underline underline-offset-2">
                    Abrir
                  </Link>
                ) : null}
                <SnoozeButton id={n.id} until={n.snoozeUntil?.toISOString() ?? null} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Sin notificaciones todavía.</p>
      )}
    </>
  );
}
