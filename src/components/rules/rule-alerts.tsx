import Link from "next/link";

import type { Alert } from "@/lib/rules/engine";
import { cn } from "@/lib/utils";

/** Avisos de «Mis reglas» (pautas de prudencia, no diagnósticos). */
export function RuleAlerts({
  alerts,
  className,
  label = "Avisos de mis reglas",
  link = { href: "/settings#mis-reglas", text: "Ajustar mis reglas" },
}: {
  alerts: Alert[];
  className?: string;
  label?: string;
  link?: { href: string; text: string } | null;
}) {
  if (!alerts.length) return null;
  return (
    <section aria-label={label} className={cn("mb-4 grid gap-2", className)}>
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
      {link ? (
        <Link href={link.href} className="justify-self-end text-xs text-muted-foreground underline-offset-2 hover:underline">
          {link.text}
        </Link>
      ) : null}
    </section>
  );
}
