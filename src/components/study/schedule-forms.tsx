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
