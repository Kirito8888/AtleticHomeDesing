"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";

export interface TemplateChip {
  id: string;
  name: string;
}

/** Plantillas guardadas: tocar = precargar el formulario; la X la borra. */
export function TemplateChips({ templates, activeId }: { templates: TemplateChip[]; activeId?: string }) {
  const router = useRouter();
  if (!templates.length) return null;
  return (
    <nav aria-label="Plantillas" className="mb-4 flex flex-wrap gap-1.5">
      {templates.map((t) => (
        <span key={t.id} className={cn("inline-flex items-center rounded-full border text-xs", t.id === activeId && "border-primary bg-primary/10")}>
          <Link href={`/training/new?template=${t.id}`} className="py-1.5 pr-1 pl-3 font-medium">
            {t.name}
          </Link>
          <button
            type="button"
            aria-label={`Borrar plantilla ${t.name}`}
            className="rounded-full p-1.5 text-muted-foreground hover:text-foreground"
            onClick={async () => {
              if (!confirm(`¿Borrar la plantilla «${t.name}»?`)) return;
              try {
                await api(`/api/training/templates/${t.id}`, { method: "DELETE" });
                toast.success("Plantilla borrada");
                router.replace("/training/new");
                router.refresh();
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
    </nav>
  );
}
