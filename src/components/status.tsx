import { AlertTriangle, CheckCircle2, OctagonAlert } from "lucide-react";

import { cn } from "@/lib/utils";

export type Status = "good" | "warning" | "critical";

const META = {
  good: { icon: CheckCircle2, color: "text-status-good", bg: "bg-status-good" },
  warning: { icon: AlertTriangle, color: "text-status-warning", bg: "bg-status-warning" },
  critical: { icon: OctagonAlert, color: "text-status-critical", bg: "bg-status-critical" },
} as const;

/** Estado = icono + texto; el color nunca va solo (accesibilidad / daltonismo). */
export function StatusLabel({ status, children, className }: { status: Status; children: React.ReactNode; className?: string }) {
  const { icon: Icon, color } = META[status];
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm font-medium", className)}>
      <Icon className={cn("size-4 shrink-0", color)} aria-hidden />
      {children}
    </span>
  );
}

export const statusBg = (s: Status) => META[s].bg;

export function readinessStatus(score: number | null | undefined): Status | null {
  if (score == null) return null;
  return score >= 75 ? "good" : score >= 50 ? "warning" : "critical";
}

/** TSB: muy negativo = fatiga acumulada. */
export function tsbStatus(tsb: number): Status {
  return tsb < -25 ? "critical" : tsb < -10 ? "warning" : "good";
}
