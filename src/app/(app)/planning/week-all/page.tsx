import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { pageUser } from "@/lib/auth/page";
import { addDays, dateOnly, startOfIsoWeek, today, toIsoDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { groupWeek, hhmm, WEEK_KIND_LABEL } from "@/lib/planning/week-all";
import { weekAll } from "@/lib/planning/week-all-service";
import { cn } from "@/lib/utils";

export const metadata = { title: "Mi semana · LifeOS" };

/** v1.8 · Entreno, clases, exámenes, estudio, entregas, citas y competiciones en una sola semana. */
export default async function WeekAllPage({ searchParams }: PageProps<"/planning/week-all">) {
  const user = await pageUser();
  const w = (await searchParams).w;
  const start = startOfIsoWeek(typeof w === "string" && /^\d{4}-\d{2}-\d{2}$/.test(w) ? dateOnly(w) : today());
  const ws = toIsoDay(start);
  const days = groupWeek(await weekAll(user.id, start), ws);
  const todayIso = toIsoDay(today());
  return (
    <>
      <PageHeader
        title="Mi semana"
        description={`Del ${formatDate(start, { day: "numeric", month: "short" })} al ${formatDate(addDays(start, 6), { day: "numeric", month: "short" })}: todo junto, solo para mirar.`}
        action={
          <nav aria-label="Semanas" className="flex gap-3 text-sm">
            <Link href={`?w=${toIsoDay(addDays(start, -7))}`} className="underline underline-offset-4">
              ← Anterior
            </Link>
            <Link href={`?w=${toIsoDay(addDays(start, 7))}`} className="underline underline-offset-4">
              Siguiente →
            </Link>
          </nav>
        }
      />
      <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="Días de la semana">
        {days.map((d) => (
          <li key={d.date} className={cn("rounded-md border p-3 text-sm", d.date === todayIso && "border-primary")}>
            <h2 className="mb-1 font-medium capitalize">{formatDate(d.date, { weekday: "long", day: "numeric" })}</h2>
            {d.items.length ? (
              <ul className="grid gap-1">
                {d.items.map((it, i) => (
                  <li key={i} className={cn("flex gap-2", it.done && "text-muted-foreground line-through")}>
                    <span className="w-11 shrink-0 text-xs text-muted-foreground tabular-nums">{it.min != null ? hhmm(it.min) : ""}</span>
                    <span className="min-w-0">
                      <span className="text-xs text-muted-foreground">{WEEK_KIND_LABEL[it.kind]} · </span>
                      {it.href ? (
                        <Link href={it.href} className="hover:underline">
                          {it.title}
                        </Link>
                      ) : (
                        it.title
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">Libre</p>
            )}
          </li>
        ))}
      </ol>
    </>
  );
}
