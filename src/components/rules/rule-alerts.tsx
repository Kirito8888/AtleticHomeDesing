import Link from "next/link";

import type { Alert } from "@/lib/rules/engine";
import { cn } from "@/lib/utils";

/** Avisos de «Mis reglas» (pautas de prudencia, no diagnósticos). */
export function RuleAlerts({ alerts, className }: { alerts: Alert[]; className?: string }) {
  if (!alerts.length) return null;
  return (
    <section aria-label="Avisos de mis reglas" className={cn("mb-4 grid gap-2", className)}>
      {alerts.map((a) => (
        <div
          key={a.id}
          role="status"
          className={cn("rounded-md border p-3 text-sm", a.level === "warn" ? "border-amber-500/50 bg-amber-500/5" : "text-muted-foreground")}
        >
          <div className="font-medium text-foreground">⚠️ {a.title}</div>
          <p>{a.message}</p>
        </div>
      ))}
      <Link href="/settings#mis-reglas" className="justify-self-end text-xs text-muted-foreground underline-offset-2 hover:underline">
        Ajustar mis reglas
      </Link>
    </section>
  );
}
