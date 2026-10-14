"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Chips, Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/client-api";
import { WEEKDAY_NAMES } from "@/lib/study/schedule";
import { type ImportedSlot, parseIcsSchedule } from "@/lib/study/schedule-import";

/** Alta de una clase semanal o de un examen. */
export function ClassForm({ today }: { today: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<"CLASS" | "EXAM">("CLASS");
  const [f, setF] = useState({ subject: "", weekday: "0", date: today, start: "09:00", end: "11:00", location: "", validTo: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    if (!f.subject.trim()) return toast.error("Pon la asignatura");
    setBusy(true);
    try {
      const common = { subject: f.subject, start: f.start, end: f.end, location: f.location || undefined };
      await api("/api/study/classes", {
        body: kind === "CLASS" ? { kind, weekday: Number(f.weekday), validTo: f.validTo || undefined, ...common } : { kind, date: f.date, ...common },
      });
      toast.success(kind === "CLASS" ? "Clase añadida" : "Examen añadido");
      setF({ ...f, subject: "", location: "" });
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      <Chips
        label="Tipo"
        value={kind}
        onChange={(v) => v && setKind(v)}
        options={[
          { value: "CLASS", label: "Clase semanal" },
          { value: "EXAM", label: "Examen" },
        ]}
      />
      <Field label="Asignatura" htmlFor="c-subject">
        <Input id="c-subject" value={f.subject} maxLength={80} onChange={set("subject")} />
      </Field>
      {kind === "CLASS" ? (
        <Field label="Día" htmlFor="c-weekday">
          <Select id="c-weekday" value={f.weekday} onChange={set("weekday")}>
            {WEEKDAY_NAMES.map((n, i) => (
              <option key={n} value={i}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <Field label="Fecha del examen" htmlFor="c-date">
          <Input id="c-date" type="date" value={f.date} onChange={set("date")} />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Inicio" htmlFor="c-start">
          <Input id="c-start" type="time" className="w-full min-w-0" value={f.start} onChange={set("start")} />
        </Field>
        <Field label="Fin" htmlFor="c-end">
          <Input id="c-end" type="time" className="w-full min-w-0" value={f.end} onChange={set("end")} />
        </Field>
      </div>
      <Field label="Aula (opcional)" htmlFor="c-loc">
        <Input id="c-loc" value={f.location} maxLength={80} onChange={set("location")} />
      </Field>
      {kind === "CLASS" ? (
        <Field label="Hasta (fin del cuatrimestre, opcional)" htmlFor="c-to">
          <Input id="c-to" type="date" value={f.validTo} onChange={set("validTo")} />
        </Field>
      ) : null}
      <Button type="button" onClick={save} disabled={busy}>
        {kind === "CLASS" ? "Añadir clase" : "Añadir examen"}
      </Button>
    </div>
  );
}

export function DeleteSlot({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={`Borrar ${label}`}
      onClick={async () => {
        try {
          await api(`/api/study/classes/${id}`, { method: "DELETE" });
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message);
        }
      }}
    >
      <Trash2 />
    </Button>
  );
}

/** v1.10 · Importar el horario de la universidad (.ics): se lee aquí, se revisa y se añaden las nuevas. */
export function ScheduleImport() {
  const router = useRouter();
  const [found, setFound] = useState<{ slots: ImportedSlot[]; ignored: number } | null>(null);
  async function read(file: File) {
    if (file.size > 2 * 1024 * 1024) return toast.error("Fichero demasiado grande (máx. 2 MB)");
    const r = parseIcsSchedule(await file.text());
    if (!r.slots.length) toast.error("No he encontrado clases ni exámenes con hora en ese .ics");
    setFound(r);
  }
  return (
    <div className="grid gap-2 text-sm">
      <Input aria-label="Horario de la universidad (.ics)" type="file" accept=".ics,text/calendar" onChange={(e) => e.target.files?.[0] && void read(e.target.files[0])} />
      <p className="text-xs text-muted-foreground">Descárgalo del campus virtual o de tu calendario de la universidad (exportar → .ics).</p>
      {found?.slots.length ? (
        <>
          <ul className="grid max-h-56 gap-0.5 overflow-auto text-xs" aria-label="Clases y exámenes encontrados">
            {found.slots.map((s, i) => (
              <li key={i}>
                {s.kind === "CLASS" ? `${WEEKDAY_NAMES[s.weekday]} ${s.start}–${s.end}` : `Examen ${s.date} ${s.start}`} · {s.subject}
                {s.location ? ` · ${s.location}` : ""}
                {s.kind === "CLASS" && s.validFrom ? ` (del ${s.validFrom}${s.validTo ? ` al ${s.validTo}` : ""})` : ""}
              </li>
            ))}
          </ul>
          {found.ignored ? <p className="text-xs text-muted-foreground">{found.ignored} eventos sueltos o de día entero no se importan.</p> : null}
          <Button
            type="button"
            className="justify-self-start"
            onClick={async () => {
              try {
                const r = await api<{ added: number; skipped: number }>("/api/study/classes/import", { body: { slots: found.slots } });
                toast.success(`${r.added} añadidos${r.skipped ? ` (${r.skipped} ya estaban)` : ""}`);
                setFound(null);
                router.refresh();
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            Añadir {found.slots.length} al horario
          </Button>
        </>
      ) : null}
    </div>
  );
}
