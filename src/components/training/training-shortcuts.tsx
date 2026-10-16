import Link from "next/link";
import { BookOpen, CalendarRange, ClipboardList, Dumbbell, GitCompare, LineChart, NotebookPen, Package, Route, ShieldPlus, Target, Timer, Zap } from "lucide-react";

import type { HubIcon, HubSection } from "@/lib/training/hub-links";

const ICON: Record<HubIcon, typeof Timer> = {
  tests: Timer,
  jump: Zap,
  performance: LineChart,
  rm: Dumbbell,
  compare: GitCompare,
  javelin: Target,
  routine: Route,
  library: BookOpen,
  seasons: CalendarRange,
  diary: NotebookPen,
  prehab: ShieldPlus,
  equipment: Package,
};

function Grid({ section }: { section: HubSection }) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {section.links.map((l) => {
        const Icon = ICON[l.icon] ?? ClipboardList;
        return (
          <li key={l.href}>
            <Link href={l.href} className="flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-accent">
              <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 leading-tight">{l.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Accesos del módulo: lo que se usa para medir, siempre a la vista; la biblioteca, plegada. */
export function TrainingShortcuts({ sections }: { sections: HubSection[] }) {
  return (
    <nav aria-label="Accesos de entrenamiento" className="mb-4 grid gap-3">
      {sections.map((s) =>
        s.id === "measure" ? (
          <section key={s.id} aria-labelledby={`hub-${s.id}`} className="grid gap-2">
            <h2 id={`hub-${s.id}`} className="text-sm font-semibold">
              {s.label}
            </h2>
            <Grid section={s} />
          </section>
        ) : (
          <details key={s.id} className="group rounded-lg border">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              {s.label}
              <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-180">
                ▾
              </span>
            </summary>
            <div className="px-3 pb-3">
              <Grid section={s} />
            </div>
          </details>
        ),
      )}
    </nav>
  );
}
