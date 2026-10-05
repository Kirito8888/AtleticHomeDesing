"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PRIORITY_LABEL } from "@/components/planning/meta";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/client-api";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface TaskItem {
  id: string;
  title: string;
  priority: keyof typeof PRIORITY_LABEL;
  status: string;
  dueDate: string | null;
}

export function TaskList({ tasks, todayIso }: { tasks: TaskItem[]; todayIso: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [due, setDue] = useState("");

  async function call(fn: () => Promise<unknown>) {
    try {
      await fn();
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="grid gap-4">
      <form
        className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_8rem_10rem_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          void call(async () => {
            await api("/api/tasks", { body: { title, priority, dueDate: due || null } });
            setTitle("");
            setDue("");
          });
        }}
      >
        <Input aria-label="Nueva tarea" placeholder="Nueva tarea…" value={title} onChange={(e) => setTitle(e.target.value)} className="col-span-2 sm:col-span-1" />
        <Select aria-label="Prioridad" value={priority} onChange={(e) => setPriority(e.target.value)}>
          {Object.entries(PRIORITY_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </Select>
        <Input aria-label="Fecha límite" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="col-span-1" />
        <Button type="submit" aria-label="Añadir tarea" className="col-span-2 sm:col-span-1">
          <Plus /> <span className="sm:hidden">Añadir</span>
        </Button>
      </form>

      {tasks.length ? (
        <ul className="grid gap-1.5">
          {tasks.map((t) => {
            const overdue = t.dueDate && t.dueDate < todayIso;
            return (
              <li key={t.id} className="flex items-center gap-3 rounded-md border px-3 py-2">
                <input
                  type="checkbox"
                  className="size-5 shrink-0"
                  aria-label={`Completar ${t.title}`}
                  checked={t.status === "DONE"}
                  onChange={(e) => void call(() => api(`/api/tasks/${t.id}`, { method: "PATCH", body: { status: e.target.checked ? "DONE" : "TODO" } }))}
                />
                <span className={cn("min-w-0 flex-1 truncate text-sm", t.status === "DONE" && "text-muted-foreground line-through")}>{t.title}</span>
                {t.dueDate ? (
                  <span className={cn("shrink-0 text-xs tabular-nums", overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
                    {overdue ? "Vencida · " : ""}
                    {formatDate(t.dueDate)}
                  </span>
                ) : null}
                <Badge variant={t.priority === "URGENT" || t.priority === "HIGH" ? "default" : "outline"} className="shrink-0">
                  {PRIORITY_LABEL[t.priority]}
                </Badge>
                <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label={`Borrar ${t.title}`} onClick={() => void call(() => api(`/api/tasks/${t.id}`, { method: "DELETE" }))}>
                  <Trash2 className="size-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Sin tareas pendientes.</p>
      )}
    </div>
  );
}
