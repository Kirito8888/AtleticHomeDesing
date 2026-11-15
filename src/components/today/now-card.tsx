import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { TodayAction } from "@/lib/today/actions";

/** v3.0 H · Lo que toca ahora: una acción principal con su porqué visible y hasta 3 secundarias. */
export function NowCard({ main, rest }: { main: TodayAction | null; rest: TodayAction[] }) {
  if (!main) {
    return (
      <section aria-label="Ahora" className="mb-4 rounded-lg border p-4">
        <h2 className="text-sm font-semibold">Todo al día</h2>
        <p className="mt-1 text-sm text-muted-foreground">No tienes nada pendiente ahora. Cuando haya una sesión planificada, una toma sin apuntar o repasos vencidos, te lo diré aquí.</p>
      </section>
    );
  }
  return (
    <section aria-label="Ahora" className="mb-4 grid gap-3 rounded-lg border border-primary/40 bg-primary/5 p-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ahora</p>
        <h2 className="text-lg font-semibold leading-tight">{main.title}</h2>
        {main.detail ? <p className="text-sm text-muted-foreground">{main.detail}</p> : null}
        <p data-testid="now-why" className="mt-1 text-xs text-muted-foreground">
          Por qué: {main.why}
        </p>
      </div>
      <Button asChild className="h-12 w-full sm:w-auto">
        <Link href={main.href}>
          {main.cta} <ArrowRight />
        </Link>
      </Button>
      {rest.length ? (
        <ul aria-label="Después" className="grid gap-1 border-t pt-2">
          {rest.map((a) => (
            <li key={a.id}>
              <Link href={a.href} className="flex min-h-11 items-center justify-between gap-2 text-sm hover:underline">
                <span className="min-w-0 truncate">{a.title}</span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
