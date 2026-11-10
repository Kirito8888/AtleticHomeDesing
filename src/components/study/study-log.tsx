"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { useFocusLog } from "@/components/study/use-focus-log";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";

/** Anotar a mano minutos estudiados sin temporizador (el temporizador único vive en /study, pestaña «Pasos»). */
export function ManualStudy({ subjects }: { subjects: string[] }) {
  const log = useFocusLog();
  const [subject, setSubject] = useState(subjects[0] ?? "");
  const [manual, setManual] = useState("");

  async function add() {
    const m = Number(manual);
    if (!subject.trim() || !(m >= 1)) return toast.error("Pon asignatura y minutos");
    if (await log({ subject: subject.trim(), minutes: Math.round(m) })) setManual("");
  }

  return (
    <div className="grid gap-3 text-sm">
      <Field label="Asignatura" htmlFor="p-subject">
        <Input id="p-subject" list="p-subjects" value={subject} maxLength={80} onChange={(e) => setSubject(e.target.value)} />
        <datalist id="p-subjects">
          {subjects.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </Field>
      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <Field label="¿Estudiaste sin temporizador? Minutos" htmlFor="p-manual">
          <Input id="p-manual" inputMode="numeric" value={manual} onChange={(e) => setManual(e.target.value)} />
        </Field>
        <Button type="button" variant="outline" onClick={add}>
          Anotar
        </Button>
      </div>
    </div>
  );
}

export function DeleteStudy({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
      aria-label={`Borrar ${label}`}
      onClick={async () => {
        try {
          await api(`/api/study/sessions/${id}`, { method: "DELETE" });
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message);
        }
      }}
    >
      borrar
    </button>
  );
}
