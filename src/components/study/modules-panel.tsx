"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";
import { formatDate } from "@/lib/format";

export interface ModuleItem {
  id: string;
  name: string;
  examDate: string | null;
  daysLeft: number | null;
  prepMode: boolean;
  topics: number;
  done: number;
  documents: number;
}

export const daysLabel = (d: number | null) => (d === null ? "sin fecha" : d < 0 ? "examen pasado" : d === 0 ? "hoy" : d === 1 ? "mañana" : `faltan ${d} días`);

/** v2.5 · Asignaturas: agrupan apuntes y temas, con fecha de examen. */
export function ModulesPanel({ modules }: { modules: ModuleItem[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [examDate, setExamDate] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const m = await api<{ id: string }>("/api/study/modules", { body: { name, examDate: examDate || null } });
      setName("");
      setExamDate("");
      toast.success("Asignatura creada");
      router.push(`/study/modules/${m.id}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <form onSubmit={create} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
        <Field label="Nueva asignatura" htmlFor="mod-name">
          <Input id="mod-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Bioquímica" maxLength={80} required />
        </Field>
        <Field label="Fecha del examen" htmlFor="mod-date">
          <Input id="mod-date" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
        </Field>
        <Button type="submit" disabled={busy || !name.trim()}>
          <Plus /> Crear
        </Button>
      </form>
      {modules.length ? (
        <ul className="grid gap-2">
          {modules.map((m) => (
            <li key={m.id}>
              <Link href={`/study/modules/${m.id}`} className="flex min-h-14 items-center gap-3 rounded-lg border p-3 hover:bg-accent">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{m.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {m.examDate ? `${formatDate(m.examDate)} · ` : ""}
                    {daysLabel(m.daysLeft)} · {m.done}/{m.topics} temas · {m.documents} apuntes
                  </div>
                </div>
                {m.prepMode ? <Badge>Preparación</Badge> : null}
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Crea una asignatura para agrupar tus apuntes, fijar la fecha del examen y obtener una ruta de estudio por prioridad.</p>
      )}
    </div>
  );
}
