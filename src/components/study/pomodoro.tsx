"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Chips, Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";

type Run = { phase: "focus" | "break"; endAt: number; minutes: number; subject: string };
const KEY = "lifeos.pomodoro";
const madridDay = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function load(): Run | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Run) : null;
  } catch {
    return null;
  }
}
function store(r: Run | null) {
  try {
    if (r) localStorage.setItem(KEY, JSON.stringify(r));
    else localStorage.removeItem(KEY);
  } catch {
    /* sin almacenamiento: el temporizador sigue en memoria */
  }
}

/**
 * Pomodoro: al terminar un bloque de concentración se anota solo en la asignatura.
 * Cuenta contra la hora de fin (no por ticks), así no se desfasa si el móvil duerme la pestaña.
 */
export function Pomodoro({ subjects }: { subjects: string[] }) {
  const router = useRouter();
  const [subject, setSubject] = useState(subjects[0] ?? "");
  const [focus, setFocus] = useState(25);
  const [pause, setPause] = useState(5);
  const [run, setRun] = useState<Run | null>(null);
  const [left, setLeft] = useState(0);
  const [manual, setManual] = useState("");
  const saving = useRef(false);

  // Recupera un pomodoro en marcha tras recargar (fuera del render para no romper la hidratación)
  useEffect(() => {
    const id = setTimeout(() => setRun(load()), 0);
    return () => clearTimeout(id);
  }, []);

  const log = useCallback(
    async (subj: string, minutes: number) => {
      await api("/api/study/sessions", { body: { subject: subj, minutes, date: madridDay() } });
      router.refresh();
    },
    [router],
  );

  useEffect(() => {
    if (!run) return;
    const tick = async () => {
      const s = Math.max(0, Math.round((run.endAt - Date.now()) / 1000));
      setLeft(s);
      if (s > 0 || saving.current) return;
      saving.current = true;
      navigator.vibrate?.([300, 150, 300]);
      try {
        if (run.phase === "focus") {
          await log(run.subject, run.minutes);
          toast.success(`${run.minutes} min de ${run.subject} anotados. Descanso.`);
          const next: Run = { phase: "break", endAt: Date.now() + pause * 60_000, minutes: pause, subject: run.subject };
          store(next);
          setRun(next);
        } else {
          toast("Fin del descanso");
          store(null);
          setRun(null);
        }
      } catch (e) {
        toast.error((e as Error).message);
        store(null);
        setRun(null);
      } finally {
        saving.current = false;
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [run, pause, log]);

  function start() {
    if (!subject.trim()) return toast.error("Elige la asignatura");
    const r: Run = { phase: "focus", endAt: Date.now() + focus * 60_000, minutes: focus, subject: subject.trim() };
    store(r);
    setRun(r);
  }

  async function stop() {
    if (!run) return;
    const done = run.phase === "focus" ? Math.floor((run.minutes * 60 - left) / 60) : 0;
    store(null);
    setRun(null);
    if (done >= 1) {
      try {
        await log(run.subject, done);
        toast.success(`${done} min anotados`);
      } catch (e) {
        toast.error((e as Error).message);
      }
    }
  }

  async function addManual() {
    const m = Number(manual);
    if (!subject.trim() || !(m >= 1)) return toast.error("Pon asignatura y minutos");
    try {
      await log(subject.trim(), Math.round(m));
      setManual("");
      toast.success("Estudio anotado");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="grid gap-4 text-sm">
      <Field label="Asignatura" htmlFor="p-subject">
        <Input id="p-subject" list="p-subjects" value={subject} maxLength={80} disabled={!!run} onChange={(e) => setSubject(e.target.value)} />
        <datalist id="p-subjects">
          {subjects.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </Field>
      {run ? (
        <div role="timer" aria-live="polite" className="grid gap-3 rounded-md border p-4 text-center">
          <p className="text-muted-foreground">{run.phase === "focus" ? `Concentración · ${run.subject}` : "Descanso"}</p>
          <p className="text-5xl font-semibold tabular-nums">{mmss(left)}</p>
          <Button type="button" variant="outline" onClick={stop}>
            {run.phase === "focus" ? "Terminar ahora (anota lo hecho)" : "Saltar descanso"}
          </Button>
        </div>
      ) : (
        <>
          <Chips
            label="Concentración"
            value={focus}
            onChange={(v) => v && setFocus(v)}
            options={[15, 25, 45, 50].map((m) => ({ value: m, label: `${m} min` }))}
          />
          <Chips label="Descanso" value={pause} onChange={(v) => v && setPause(v)} options={[5, 10, 15].map((m) => ({ value: m, label: `${m} min` }))} />
          <Button type="button" size="lg" onClick={start}>
            Empezar pomodoro
          </Button>
        </>
      )}
      <div className="grid grid-cols-[1fr_auto] items-end gap-2 border-t pt-3">
        <Field label="¿Estudiaste sin temporizador? Minutos" htmlFor="p-manual">
          <Input id="p-manual" inputMode="numeric" value={manual} onChange={(e) => setManual(e.target.value)} />
        </Field>
        <Button type="button" variant="outline" onClick={addManual}>
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
