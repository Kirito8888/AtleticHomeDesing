import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * v3.0 G (V3-D02) · Marca común de «aquí actúa la IA»: icono + texto (nunca solo color). La IA no es un
 * destino del menú: aparece en la vertical donde trabaja (plan, entreno, estudio). Ver docs/diseno-v3.md.
 */
export function AiBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded border px-1 text-2xs font-semibold text-muted-foreground", className)}>
      <Sparkles aria-hidden className="size-3" />
      IA
    </span>
  );
}
