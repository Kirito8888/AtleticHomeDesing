"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/client-api";
import { capitalizeFirst, formatDate, formatInt } from "@/lib/format";
import { cn } from "@/lib/utils";

type DayContext = { date: string; training: string[]; other: { subject: string; topic: string | null; minutes: number; done: boolean }[]; free: number };
type Draft = {
  examDate: string | null;
  dailyMin: number;
  days: DayContext[];
  blocks: { topicId: string; topic: string; date: string; minutes: number }[];
  unscheduled: { topicId: string; topic: string; minutes: number }[];
  replaced: number;
};
type Row = { key: number; topicId: string; topic: string; date: string; minutes: string };

const dayLabel = (iso: string) => capitalizeFirst(formatDate(iso, { weekday: "long", day: "numeric", month: "short" }));
const shortDay = (iso: string) => capitalizeFirst(formatDate(iso, { weekday: "short", day: "numeric", month: "short" }));

/**
 * v2.9 · N4 · «Planificar en el calendario»: pide el borrador de la ruta en bloques por día, deja
 * retocarlo (minutos, día, quitar) y solo al pulsar «Aceptar e incorporar al plan» lo guarda.
 */
export function RoutePlan({ moduleId }: { moduleId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [saved, setSaved] = useState<{ created: number; day: string } | null>(null);

  async function load() {
    setBusy(true);
    setSaved(null);
    try {
      const d = await api<Draft>(`/api/study/modules/${moduleId}/plan`);
      setDraft(d);
      setRows(d.blocks.map((b, i) => ({ key: i, topicId: b.topicId, topic: b.topic, date: b.date, minutes: String(b.minutes) })));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function accept() {
    if (!draft) return;
    setBusy(true);
    try {
      const r = await api<{ created: number; replaced: number }>(`/api/study/modules/${moduleId}/plan`, {
        body: { blocks: rows.map((b) => ({ topicId: b.topicId, date: b.date, minutes: Number(b.minutes) })) },
      });
      toast.success(`${formatInt(r.created)} bloques incorporados al plan`);
      setSaved({ created: r.created, day: [...rows].sort((a, b) => a.date.localeCompare(b.date))[0].date });
      setDraft(null);
      setRows([]);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const edit = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const valid = rows.length > 0 && rows.every((r) => Number.isInteger(Number(r.minutes)) && Number(r.minutes) >= 5 && Number(r.minutes) <= 600);

  return (
    <section aria-label="Planificar en el calendario" className="grid gap-2">
      {!draft ? (
        <>
          <Button variant="outline" disabled={busy} onClick={load}>
            <CalendarPlus /> Planificar en el calendario
          </Button>
          {saved ? (
            <p role="status" className="text-sm">
              {formatInt(saved.created)} bloques en tu plan.{" "}
              <Link href={`/planning?month=${saved.day.slice(0, 7)}&day=${saved.day}`} className="underline underline-offset-4">
                Ver en Planificación
              </Link>
            </p>
          ) : null}
        </>
      ) : (
        <div className="grid gap-3 rounded-lg border p-3">
          <h2 className="text-lg font-semibold">Borrador del plan</h2>
          <p role="status" className="text-sm text-muted-foreground">
            Aún no se ha guardado nada. {formatInt(draft.dailyMin)} min al día como máximo, menos clases y entrenos
            {draft.examDate ? `; hasta la víspera del examen (${formatDate(draft.examDate)})` : "; sin fecha de examen: próximas 4 semanas"}.
            {draft.replaced ? ` Al aceptar se sustituyen ${formatInt(draft.replaced)} bloques pendientes de esta asignatura.` : ""}
          </p>
          {draft.days
            .filter((d) => rows.some((r) => r.date === d.date))
            .map((d) => {
              const mine = rows.filter((r) => r.date === d.date);
              const used = mine.reduce((a, r) => a + (Number(r.minutes) || 0), 0);
              return (
                <div key={d.date} data-day={d.date} className="grid gap-2 rounded-md border p-2">
                  <div className="text-sm font-medium">{dayLabel(d.date)}</div>
                  {d.training.length || d.other.length ? (
                    <ul className="text-xs text-muted-foreground" aria-label="Ya hay ese día">
                      {d.training.map((t, i) => (
                        <li key={`t${i}`}>Entreno: {t}</li>
                      ))}
                      {d.other.map((o, i) => (
                        <li key={`o${i}`}>
                          Estudio: {o.subject}
                          {o.topic ? ` · ${o.topic}` : ""} · {formatInt(o.minutes)} min{o.done ? " (hecho)" : ""}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {mine.map((r) => (
                    <div key={r.key} data-block={r.topic} className="grid grid-cols-[1fr_auto] items-end gap-2">
                      <div className="col-span-2 truncate text-sm">{r.topic}</div>
                      <div className="grid grid-cols-[1fr_5.5rem] gap-2">
                        <Select aria-label={`Día de ${r.topic}`} value={r.date} onChange={(e) => edit(r.key, { date: e.target.value })}>
                          {draft.days.map((x) => (
                            <option key={x.date} value={x.date}>
                              {shortDay(x.date)}
                            </option>
                          ))}
                        </Select>
                        <Input
                          aria-label={`Minutos de ${r.topic}`}
                          type="number"
                          inputMode="numeric"
                          min={5}
                          max={600}
                          step={5}
                          value={r.minutes}
                          onChange={(e) => edit(r.key, { minutes: e.target.value })}
                        />
                      </div>
                      <Button size="icon" variant="ghost" aria-label={`Quitar ${r.topic} del ${dayLabel(d.date)}`} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                  <p className={cn("text-xs", used > d.free ? "font-medium text-destructive" : "text-muted-foreground")}>
                    {formatInt(used)} de {formatInt(d.free)} min libres{used > d.free ? " · supera lo libre de ese día" : ""}
                  </p>
                </div>
              );
            })}
          {!rows.length ? <p className="text-sm text-muted-foreground">No queda ningún bloque en el borrador.</p> : null}
          {draft.unscheduled.length ? (
            <div className="grid gap-1 rounded-md border border-dashed p-2 text-sm" aria-label="No cabe">
              <div className="font-medium">No cabe {draft.examDate ? "antes del examen" : "en estas semanas"}</div>
              <ul className="text-muted-foreground">
                {draft.unscheduled.map((u) => (
                  <li key={u.topicId}>
                    {u.topic} · {formatInt(u.minutes)} min
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-[auto_1fr]">
            <Button disabled={busy || !valid} onClick={accept} className="sm:order-2">
              Aceptar e incorporar al plan
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => (setDraft(null), setRows([]))}>
              Descartar
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
