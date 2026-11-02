"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";
import { activeKinds, DEFAULT_FORMAT, examFormatSchema, KIND_LABEL, type ExamFormat, type Kind } from "@/lib/study/exam-format";
import { cn } from "@/lib/utils";

type Flag = "theory" | "practical" | "test" | "essay";
const FLAGS: { key: Flag; label: string; hint: string }[] = [
  { key: "theory", label: "Teórico", hint: "Conceptos y definiciones" },
  { key: "practical", label: "Práctico", hint: "Comandos y casos (terminal)" },
  { key: "test", label: "Tipo test", hint: "Elegir entre opciones" },
  { key: "essay", label: "Desarrollo", hint: "Respuesta abierta, con rúbrica" },
];

/**
 * Pregunta previa a generar un paquete: ¿cómo es tu examen? Contenido (teórico / práctico) × forma (test / desarrollo), pesos
 * opcionales, minutos y nº de preguntas. Lo guarda en la asignatura y condiciona qué preguntas se generan y cómo se compone el examen final.
 */
export function ExamFormatForm({ moduleId, initial, onSaved }: { moduleId: string; initial: ExamFormat; onSaved: (f: ExamFormat) => void }) {
  const [f, setF] = useState<Record<Flag, boolean>>({ theory: initial.theory, practical: initial.practical, test: initial.test, essay: initial.essay });
  const [manual, setManual] = useState(Boolean(initial.weights));
  const [weights, setWeights] = useState<Partial<Record<Kind, string>>>(() => Object.fromEntries(Object.entries(initial.weights ?? {}).map(([k, v]) => [k, String(v)])));
  const [minutes, setMinutes] = useState(String(initial.minutes));
  const [questions, setQuestions] = useState(String(initial.questions));
  const [busy, setBusy] = useState(false);

  const kinds = activeKinds(f);
  const candidate = {
    ...f,
    minutes: Number(minutes),
    questions: Number(questions),
    ...(manual ? { weights: Object.fromEntries(kinds.map((k) => [k, Number(weights[k] ?? 0)])) } : {}),
  };
  const parsed = examFormatSchema.safeParse(candidate);
  const problem = parsed.success ? null : parsed.error.issues[0]?.message;
  const sum = kinds.reduce((a, k) => a + (Number(weights[k]) || 0), 0);

  return (
    <form
      className="grid gap-3 rounded-lg border p-3"
      data-testid="exam-format"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!parsed.success) return;
        setBusy(true);
        try {
          const r = await api<{ examFormat: ExamFormat }>(`/api/study/modules/${moduleId}/exam-format`, { method: "PUT", body: parsed.data });
          toast.success("Formato de examen guardado");
          onSaved(r.examFormat);
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <h3 className="font-semibold">¿Cómo es tu examen?</h3>
        <p className="text-sm text-muted-foreground">Marca todo lo que entra. Con esto se generan las preguntas y se compone el examen final.</p>
      </div>
      <div role="group" aria-label="Tipo de examen" className="grid grid-cols-2 gap-2">
        {FLAGS.map((o) => (
          <button
            key={o.key}
            type="button"
            role="checkbox"
            aria-checked={f[o.key]}
            onClick={() => setF((x) => ({ ...x, [o.key]: !x[o.key] }))}
            className={cn("min-h-14 rounded-md border px-2 py-1.5 text-left text-sm transition-colors", f[o.key] ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent")}
          >
            <span className="block font-medium">{o.label}</span>
            <span className={cn("block text-xs", f[o.key] ? "text-primary-foreground/80" : "text-muted-foreground")}>{o.hint}</span>
          </button>
        ))}
      </div>
      {kinds.length > 1 ? (
        <div className="grid gap-2">
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="size-5" checked={manual} onChange={(e) => setManual(e.target.checked)} />
            Repartir a mano el peso de cada tipo (si no, a partes iguales)
          </label>
          {manual ? (
            <div className="grid gap-2">
              {kinds.map((k) => (
                <Field key={k} label={`${KIND_LABEL[k]} (%)`} htmlFor={`w-${k}`}>
                  <Input id={`w-${k}`} type="number" inputMode="numeric" min={0} max={100} value={weights[k] ?? ""} onChange={(e) => setWeights((w) => ({ ...w, [k]: e.target.value }))} />
                </Field>
              ))}
              <p role="status" className={cn("text-sm", sum === 100 ? "text-muted-foreground" : "text-destructive")}>
                Suma {sum} % (deben ser 100).
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Duración (min)" htmlFor="ef-min">
          <Input id="ef-min" type="number" inputMode="numeric" min={5} max={240} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </Field>
        <Field label="Preguntas" htmlFor="ef-q">
          <Input id="ef-q" type="number" inputMode="numeric" min={4} max={80} value={questions} onChange={(e) => setQuestions(e.target.value)} />
        </Field>
      </div>
      {problem ? (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}
      <Button type="submit" disabled={busy || !parsed.success} className="min-h-11">
        Guardar formato
      </Button>
    </form>
  );
}

export { DEFAULT_FORMAT };
