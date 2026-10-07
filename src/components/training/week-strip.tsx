import Link from "next/link";

import type { WeekDay } from "@/lib/training/week";
import { cn } from "@/lib/utils";

const STATE: Record<WeekDay["state"], { icon: string; text: string; cls: string }> = {
  done: { icon: "✓", text: "hecho", cls: "border-primary bg-primary text-primary-foreground" },
  pending: { icon: "•", text: "pendiente", cls: "border-primary/60" },
  missed: { icon: "!", text: "sin registrar", cls: "border-amber-500 text-amber-700 dark:text-amber-400" },
  skipped: { icon: "–", text: "saltado", cls: "text-muted-foreground" },
  rest: { icon: "", text: "descanso", cls: "text-muted-foreground" },
};

/** Semana L–D: estado de cada día y lanzamientos frente al tope. */
export function WeekStrip({ days, today, throws, cap }: { days: WeekDay[]; today: string; throws: number; cap: number | null }) {
  return (
    <section aria-label="Esta semana" className="mb-4 grid gap-2">
      <ol className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const st = STATE[d.state];
          return (
            <li key={d.date}>
              <Link
                href={`/planning?month=${d.date.slice(0, 7)}&day=${d.date}#dia`}
                aria-label={`${d.label} ${d.date.slice(8)}: ${st.text}`}
                className={cn("grid place-items-center rounded-md border py-1.5 text-xs", st.cls, d.date === today && "ring-2 ring-ring ring-offset-1")}
              >
                <span className="font-medium">{d.label}</span>
                <span className="h-4 tabular-nums">{st.icon}</span>
              </Link>
            </li>
          );
        })}
      </ol>
      {throws > 0 || cap != null ? (
        <p className={cn("text-xs text-muted-foreground tabular-nums", cap != null && throws > cap && "font-medium text-destructive")}>
          Lanzamientos esta semana: {throws}
          {cap != null ? ` de ${cap} (tope)` : " · sin tope (faltan semanas de base)"}
        </p>
      ) : null}
    </section>
  );
}
