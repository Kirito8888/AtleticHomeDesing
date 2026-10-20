import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Vacío con salida: qué falta, por qué importa y un botón para empezar. */
export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: string; action?: { href: string; label: string } }) {
  return (
    <div className="grid justify-items-start gap-2 rounded-lg border border-dashed p-4" data-slot="empty-state">
      <Icon className="size-6 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium">{title}</p>
      {text ? <p className="text-sm text-muted-foreground">{text}</p> : null}
      {action ? (
        <Button asChild variant="outline" size="sm" className="min-h-11">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      ) : null}
    </div>
  );
}
