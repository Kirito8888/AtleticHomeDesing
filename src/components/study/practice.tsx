"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import {
  emptyPractice,
  type LineKind,
  MAX_ANSWER_CHARS,
  PRACTICE_COUNTS,
  type PracticeExercise,
  MAX_DONE,
  practiceKey,
  type PracticeReview,
  type PracticeState,
  parsePracticeState,
  serializePracticeState,
} from "@/lib/study/practice";

const doneKey = (moduleId: string) => `${practiceKey(moduleId)}:done`;
function readDone(moduleId: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(doneKey(moduleId)) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, MAX_DONE) : [];
  } catch {
    return [];
  }
}
function writeDone(moduleId: string, titles: string[]) {
  try {
    localStorage.setItem(doneKey(moduleId), JSON.stringify(titles.slice(0, MAX_DONE)));
  } catch {
    /* sin almacenamiento */
  }
}
const MODES = [
  { id: "teacher", label: "Del profesor" },
  { id: "similar", label: "Nuevos parecidos" },
] as const;

const VERDICT: Record<PracticeReview["verdict"], string> = { correct: "Correcto", partial: "Casi: hay fallos concretos", incorrect: "Todavía no" };
const KIND: Record<LineKind, { label: string; cls: string; icon: typeof Check }> = {
  ok: { label: "Bien", cls: "border-emerald-600/40", icon: Check },
  error: { label: "Error", cls: "border-destructive/60", icon: X },
  warning: { label: "Mejorable", cls: "border-amber-500/60", icon: AlertTriangle },
};

/** Práctica guiada: ejercicios sobre los apuntes, pistas progresivas y corrección por IA. La tanda vive en `localStorage`. */
export function Practice({ moduleId, documents }: { moduleId: string; documents: { id: string; title: string }[] }) {
  const raw = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return localStorage.getItem(practiceKey(moduleId));
      } catch {
        return null;
      }
    },
    () => null,
  );
  const saved = useMemo(() => parsePracticeState(raw), [raw]);
  const [override, setOverride] = useState<PracticeState | null | "cleared">(null);
  const st = override === "cleared" ? null : (override ?? saved);

  const [count, setCount] = useState<number>(3);
  const [mode, setMode] = useState<"teacher" | "similar">("teacher");
  const [focus, setFocus] = useState("");
  const [picked, setPicked] = useState<string[]>(() => documents.map((d) => d.id));
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [showSolution, setShowSolution] = useState(false);

  function commit(next: PracticeState | null) {
    setOverride(next ?? "cleared");
    try {
      if (next) localStorage.setItem(practiceKey(moduleId), serializePracticeState(next));
      else localStorage.removeItem(practiceKey(moduleId));
    } catch {
      /* sin almacenamiento: la tanda sigue en pantalla */
    }
  }

  async function generate() {
    setBusy(true);
    try {
      const r = await api<{ exercises: PracticeExercise[] }>("/api/ai/study/practice", {
        body: { moduleId, count, mode, exclude: readDone(moduleId), documentIds: picked.length === documents.length ? [] : picked, focus: focus.trim() || undefined },
      });
      setShowSolution(false);
      commit(emptyPractice(r.exercises));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!st) {
    return (
      <div className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          Sube tus apuntes y hojas de ejercicios (PDF o Word) a la asignatura. Elige si quieres los ejercicios del profesor tal cual o nuevos del mismo estilo. Escribe tu código, pide pistas si te atascas y la IA lo corrige línea a línea. El código no se ejecuta en ningún sitio y no se guarda en el servidor.
        </p>
        {documents.length ? (
          <fieldset className="grid gap-1.5">
            <legend className="text-sm font-medium">Apuntes que se usan</legend>
            {documents.map((d) => (
              <label key={d.id} className="flex min-h-11 items-center gap-2 rounded-lg border p-2 text-sm">
                <input
                  type="checkbox"
                  className="size-5"
                  checked={picked.includes(d.id)}
                  onChange={(e) => setPicked((p) => (e.target.checked ? [...p, d.id] : p.filter((x) => x !== d.id)))}
                />
                <span className="min-w-0 flex-1 truncate">{d.title}</span>
              </label>
            ))}
          </fieldset>
        ) : (
          <p role="status" className="rounded-lg border border-dashed p-3 text-sm">
            Esta asignatura aún no tiene apuntes procesados. Sube tus apuntes y ejercicios de PHP en la asignatura y vuelve.
          </p>
        )}
        <div className="grid gap-1.5">
          <span id="pr-mode" className="text-sm font-medium">
            Qué ejercicios
          </span>
          <div role="radiogroup" aria-labelledby="pr-mode" className="grid grid-cols-2 gap-2">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={mode === m.id}
                onClick={() => setMode(m.id)}
                data-testid={`pr-mode-${m.id}`}
                className={cn("min-h-11 rounded-md border px-2 text-sm transition-colors", mode === m.id ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent")}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <label className="grid gap-1.5 text-sm font-medium">
          Tema (opcional)
          <input
            value={focus}
            maxLength={120}
            onChange={(e) => setFocus(e.target.value)}
            placeholder="p. ej. bucles y arrays"
            className="min-h-11 rounded-md border bg-background px-3 text-base font-normal"
          />
        </label>
        <div className="grid gap-1.5">
          <span id="pr-count" className="text-sm font-medium">
            Ejercicios
          </span>
          <div role="radiogroup" aria-labelledby="pr-count" className="grid grid-cols-2 gap-2">
            {PRACTICE_COUNTS.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={count === n}
                onClick={() => setCount(n)}
                className={cn("min-h-11 rounded-md border px-2 text-sm transition-colors", count === n ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent")}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <Button className="min-h-11" disabled={busy || !documents.length || !picked.length} onClick={generate} data-testid="pr-generate">
          {busy ? "Preparando ejercicios…" : "Generar ejercicios"}
        </Button>
      </div>
    );
  }

  const ex = st.exercises[st.i];
  const answer = st.answers[st.i] ?? "";
  const hintsShown = st.hints[st.i] ?? 0;
  const review = st.reviews[st.i];
  const update = (patch: Partial<PracticeState>) => commit({ ...st, ...patch });
  const go = (i: number) => {
    setShowSolution(false);
    update({ i });
  };

  async function correct() {
    setReviewing(true);
    try {
      const r = await api<{ review: PracticeReview }>("/api/ai/study/practice/review", {
        body: { moduleId, exercise: { title: ex.title, statement: ex.statement, solution: ex.solution, language: ex.language, evidence: ex.evidence.slice(0, 600) }, answer },
      });
      update({ reviews: { ...st!.reviews, [st!.i]: r.review } });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setReviewing(false);
    }
  }

  const done = Object.values(st.reviews).filter((r) => r.verdict === "correct").length;
  return (
    <div className="grid gap-4" data-testid="pr-active">
      <p role="status" className="text-sm text-muted-foreground">
        Ejercicio {st.i + 1} de {st.exercises.length} · {done} correcto{done === 1 ? "" : "s"}
      </p>
      <section aria-label="Enunciado" className="grid gap-2 rounded-lg border p-3">
        <h2 className="text-base font-semibold">{ex.title}</h2>
        <p className="whitespace-pre-wrap text-sm">{ex.statement}</p>
        {ex.verified ? null : <p className="text-xs text-muted-foreground">Basado en tus apuntes, pero la cita no se pudo comprobar literalmente.</p>}
      </section>

      {hintsShown > 0 ? (
        <ol aria-label="Pistas" data-testid="pr-hints" className="grid gap-1.5">
          {ex.hints.slice(0, hintsShown).map((h, k) => (
            <li key={k} className="rounded-lg border border-dashed p-2 text-sm">
              <strong>Pista {k + 1}:</strong> {h}
            </li>
          ))}
        </ol>
      ) : null}
      {hintsShown < ex.hints.length ? (
        <Button variant="outline" className="min-h-11" onClick={() => update({ hints: { ...st.hints, [st.i]: hintsShown + 1 } })} data-testid="pr-hint">
          Pedir pista ({hintsShown + 1}/{ex.hints.length})
        </Button>
      ) : null}

      <label className="grid gap-1.5 text-sm font-medium">
        Tu solución ({ex.language})
        <Textarea
          value={answer}
          maxLength={MAX_ANSWER_CHARS}
          rows={10}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          onChange={(e) => update({ answers: { ...st.answers, [st.i]: e.target.value } })}
          placeholder={ex.starter || "Escribe aquí tu código"}
          className="font-mono text-base"
          data-testid="pr-answer"
        />
      </label>
      <Button className="min-h-11" disabled={reviewing || !answer.trim()} onClick={correct} data-testid="pr-correct">
        {reviewing ? "Corrigiendo…" : "Corregir"}
      </Button>

      {review ? (
        <section aria-label="Corrección" data-testid="pr-review" className="grid gap-3 rounded-lg border p-3">
          <p className="font-medium" data-testid="pr-verdict">
            {VERDICT[review.verdict]}
          </p>
          <p className="text-sm">{review.summary}</p>
          {review.lines.length ? (
            <ul className="grid gap-1.5" aria-label="Comentarios por línea">
              {review.lines.map((l, k) => {
                const K = KIND[l.kind];
                return (
                  <li key={k} data-kind={l.kind} className={cn("grid gap-1 rounded-md border-l-4 bg-muted/30 p-2 text-sm", K.cls)}>
                    <span className="flex items-center gap-1.5 font-medium">
                      <K.icon className="size-4" aria-hidden /> {K.label} · línea {l.line}
                    </span>
                    <code className="block overflow-x-auto whitespace-pre text-xs">{l.code}</code>
                    <span>{l.comment}</span>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {review.steps.length ? (
            <ol className="grid list-decimal gap-1 pl-5 text-sm" aria-label="Pasos">
              {review.steps.map((s, k) => (
                <li key={k}>{s}</li>
              ))}
            </ol>
          ) : null}
          {review.fixed ? (
            <details className="text-sm">
              <summary className="min-h-11 cursor-pointer py-2 font-medium">Ver código corregido</summary>
              <pre className="overflow-x-auto rounded-md bg-muted/40 p-2 text-xs">{review.fixed}</pre>
            </details>
          ) : null}
        </section>
      ) : null}

      <Button variant="outline" className="min-h-11" onClick={() => setShowSolution((v) => !v)} aria-expanded={showSolution}>
        {showSolution ? "Ocultar solución esperada" : "Ver solución esperada"}
      </Button>
      {showSolution ? <pre data-testid="pr-solution" className="overflow-x-auto rounded-md bg-muted/40 p-2 text-xs">{ex.solution}</pre> : null}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="min-h-11" disabled={st.i === 0} onClick={() => go(st.i - 1)}>
          Anterior
        </Button>
        <Button variant="outline" className="min-h-11" disabled={st.i === st.exercises.length - 1} onClick={() => go(st.i + 1)} data-testid="pr-next">
          Siguiente
        </Button>
      </div>
      <Button
        variant="ghost"
        className="min-h-11"
        onClick={() => {
          writeDone(moduleId, [...st.exercises.map((e) => e.title), ...readDone(moduleId)].filter((t, k, a) => a.indexOf(t) === k));
          setShowSolution(false);
          commit(null);
        }}
        data-testid="pr-reset"
      >
        Nueva tanda
      </Button>
    </div>
  );
}
