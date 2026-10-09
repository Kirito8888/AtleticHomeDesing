"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";

const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);
const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
const num = (s: string) => Number(s.replace(",", "."));

type Exam = { id: string; subject: string; date: string; hours: number; plannedMin: number; doneMin: number };

/** Horas por examen y botón para (re)generar los bloques desde hoy. Lo que no cabe se dice. */
export function ExamPlanForm({ exams }: { exams: Exam[] }) {
  const router = useRouter();
  const [hours, setHours] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [short, setShort] = useState<Array<{ subject: string; minutes: number }> | null>(null);
  const value = (e: Exam) => hours[e.id] ?? String(e.hours);
  async function generate() {
    setBusy(true);
    try {
      const body = Object.fromEntries(exams.map((e) => [e.id, num(value(e))]).filter(([, h]) => Number.isFinite(h)));
      const r = await api<{ blocks: number; shortfall: Array<{ subject: string; minutes: number }> }>("/api/study/exam-plan", { body: { hours: body } });
      setShort(r.shortfall);
      toast.success(`Plan de estudio con ${r.blocks} bloques`);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!exams.length) return <p className="text-sm text-muted-foreground">No hay exámenes próximos: añádelos en el horario.</p>;
  return (
    <div className="grid gap-3 text-sm">
      <ul className="grid gap-2">
        {exams.map((e) => (
          <li key={e.id} className="grid grid-cols-[1fr_5rem] items-center gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium">{e.subject}</p>
              <p className="text-xs text-muted-foreground">
                {day(e.date)} · planificado {hm(e.plannedMin)} · hecho {hm(e.doneMin)}
              </p>
            </div>
            <Input aria-label={`Horas para ${e.subject}`} inputMode="decimal" className="w-full min-w-0" value={value(e)} onChange={(ev) => setHours({ ...hours, [e.id]: ev.target.value })} />
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Rehace los bloques pendientes desde hoy; los hechos se quedan. Descuenta clases y días de entreno (Mis reglas). No toca tu plan de entrenamiento.</p>
      <Button type="button" onClick={generate} disabled={busy}>
        Generar plan de estudio
      </Button>
      {short?.length ? (
        <p role="alert" className="rounded-md border border-destructive/40 p-2 text-destructive">
          No te da tiempo a todo: faltan {short.map((s) => `${hm(s.minutes)} de ${s.subject}`).join(", ")}. Baja horas, quita otra cosa o empieza antes.
        </p>
      ) : null}
    </div>
  );
}

/** Bloques por día con su casilla (el pomodoro también los tacha solo). */
export function StudyBlocks({ blocks: initial }: { blocks: Array<{ id: string; subject: string; date: string; minutes: number; done: boolean }> }) {
  const [blocks, setBlocks] = useState(initial);
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setBlocks(initial);
  }
  const days = [...new Set(blocks.map((b) => b.date))];
  async function toggle(id: string, done: boolean) {
    setBlocks(blocks.map((b) => (b.id === id ? { ...b, done } : b)));
    try {
      await api(`/api/study/exam-plan/${id}`, { method: "PATCH", body: { done } });
    } catch (err) {
      setBlocks(blocks);
      toast.error((err as Error).message);
    }
  }
  if (!blocks.length) return <p className="text-sm text-muted-foreground">Sin bloques todavía.</p>;
  return (
    <div className="grid gap-3 text-sm" aria-label="Bloques de estudio">
      {days.map((d) => (
        <div key={d} className="grid gap-1">
          <p className="text-xs font-medium text-muted-foreground">{day(d)}</p>
          {blocks
            .filter((b) => b.date === d)
            .map((b) => (
              <label key={b.id} className={cn("flex items-center gap-2 rounded-md border px-2 py-1.5", b.done && "text-muted-foreground line-through")}>
                <input type="checkbox" className="size-4" checked={b.done} onChange={(e) => toggle(b.id, e.target.checked)} />
                <span className="min-w-0 flex-1 truncate">{b.subject}</span>
                <span className="shrink-0 tabular-nums">{hm(b.minutes)}</span>
              </label>
            ))}
        </div>
      ))}
    </div>
  );
}

type Grade = { id: string; subject: string; term: string | null; grade: number | null; credits: number };

/** Notas y créditos con media ponderada. */
export function GradesPanel({ grades, average, passedCredits, pendingCredits }: { grades: Grade[]; average: number | null; passedCredits: number; pendingCredits: number }) {
  const router = useRouter();
  const [f, setF] = useState({ subject: "", term: "", grade: "", credits: "6" });
  async function add() {
    try {
      await api("/api/study/grades", { body: { subject: f.subject, term: f.term || null, grade: f.grade.trim() ? num(f.grade) : null, credits: num(f.credits) || 6 } });
      setF({ ...f, subject: "", grade: "" });
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }
  async function remove(g: Grade) {
    if (!confirm(`¿Borrar ${g.subject}?`)) return;
    await api(`/api/study/grades/${g.id}`, { method: "DELETE" }).catch((e: Error) => toast.error(e.message));
    router.refresh();
  }
  return (
    <div className="grid gap-3 text-sm">
      <p aria-label="Media ponderada" className="rounded-md bg-muted p-2">
        Media ponderada: <span className="font-semibold tabular-nums">{average != null ? average.toFixed(2) : "—"}</span> · {passedCredits} créditos aprobados · {pendingCredits} sin nota
      </p>
      {grades.length ? (
        <table className="w-full text-left" aria-label="Notas">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-1 font-normal">Asignatura</th>
              <th className="py-1 font-normal">Conv.</th>
              <th className="py-1 text-right font-normal">Nota</th>
              <th className="py-1 text-right font-normal">ECTS</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {grades.map((g) => (
              <tr key={g.id} className="border-t">
                <td className="max-w-0 truncate py-1.5">{g.subject}</td>
                <td className="py-1.5 text-xs text-muted-foreground">{g.term ?? ""}</td>
                <td className={cn("py-1.5 text-right tabular-nums", g.grade != null && g.grade < 5 && "text-destructive")}>{g.grade ?? "—"}</td>
                <td className="py-1.5 text-right tabular-nums">{g.credits}</td>
                <td className="py-1.5 text-right">
                  <button type="button" aria-label={`Borrar ${g.subject}`} className="px-1 text-destructive" onClick={() => remove(g)}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <form
        className="grid grid-cols-2 gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (f.subject.trim()) void add();
        }}
      >
        <Input aria-label="Asignatura" className="col-span-2 w-full min-w-0" placeholder="Asignatura" maxLength={80} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />
        <Input aria-label="Convocatoria" className="w-full min-w-0" placeholder="Convocatoria" maxLength={40} value={f.term} onChange={(e) => setF({ ...f, term: e.target.value })} />
        <div className="grid grid-cols-2 gap-2">
          <Input aria-label="Nota" inputMode="decimal" className="w-full min-w-0" placeholder="Nota" value={f.grade} onChange={(e) => setF({ ...f, grade: e.target.value })} />
          <Input aria-label="Créditos" inputMode="decimal" className="w-full min-w-0" placeholder="ECTS" value={f.credits} onChange={(e) => setF({ ...f, credits: e.target.value })} />
        </div>
        <Button type="submit" variant="outline" className="col-span-2">
          Añadir nota
        </Button>
      </form>
    </div>
  );
}
