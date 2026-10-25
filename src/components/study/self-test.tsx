"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/client-api";
import { formatDec } from "@/lib/format";
import { cn } from "@/lib/utils";
import { type Tag, TAG_EMOJI, TAG_LABEL } from "@/lib/study/adhd-report";
import { type Answered, estimateLevel, type Score, TEST_COUNTS, type TestQuestion } from "@/lib/study/self-test";

export const selfTestKey = (moduleId: string) => `atlenza.study.selfTest.${moduleId}`;
export interface LastAttempt {
  score: number;
  label: string;
  weak: string[];
  at: string;
}
function parseLast(raw: string | null): LastAttempt | null {
  try {
    return raw ? (JSON.parse(raw) as LastAttempt) : null;
  } catch {
    return null;
  }
}

type Phase = "intro" | "quiz" | "grade" | "result";
const GRADES: { label: string; score: Score }[] = [
  { label: "Bien", score: 1 },
  { label: "A medias", score: 0.5 },
  { label: "Mal", score: 0 },
];
const fmt = (n: number) => formatDec(n, 1);

/** v2.5 · «Evaluar nivel»: test paso a paso sobre los apuntes de la asignatura, con soluciones y nota estimada. */
export function SelfTest({ moduleId, topics }: { moduleId: string; topics: { name: string; tag: Tag; done: boolean }[] }) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [count, setCount] = useState<number>(8);
  const [busy, setBusy] = useState(false);
  const [qs, setQs] = useState<TestQuestion[]>([]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [written, setWritten] = useState<Record<number, string>>({});
  const [graded, setGraded] = useState<Record<number, Score>>({});
  // Lectura de localStorage sin romper la hidratación: en el servidor es null.
  const lastRaw = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return localStorage.getItem(selfTestKey(moduleId));
      } catch {
        return null;
      }
    },
    () => null,
  );
  const last = useMemo(() => parseLast(lastRaw), [lastRaw]);

  async function start(weak: string[]) {
    setBusy(true);
    try {
      const r = await api<{ questions: TestQuestion[] }>("/api/ai/study/self-test", { body: { moduleId, count, weak } });
      setQs(r.questions);
      setI(0);
      setPicked({});
      setWritten({});
      setGraded({});
      setPhase("quiz");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const scoreOf = (n: number): Score => {
    const q = qs[n];
    return q.kind === "choice" ? (picked[n] === q.answer ? 1 : 0) : (graded[n] ?? 0);
  };
  const answered = (): Answered[] => qs.map((q, n) => ({ topic: q.topic, tag: q.tag, score: scoreOf(n) }));
  const level = phase === "result" ? estimateLevel(answered(), topics) : null;

  function finish() {
    const hasCases = qs.some((q) => q.kind === "case");
    if (hasCases) return setPhase("grade");
    conclude();
  }
  function conclude() {
    const l = estimateLevel(answered(), topics);
    try {
      localStorage.setItem(selfTestKey(moduleId), JSON.stringify({ score: l.score, label: l.label, weak: l.gaps.map((g) => g.topic), at: new Date().toISOString() } satisfies LastAttempt));
    } catch {
      /* sin almacenamiento: el resultado se ve igual */
    }
    setPhase("result");
  }

  if (phase === "intro")
    return (
      <div className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          Un test redactado sobre tus apuntes, con más preguntas de lo que marcaste 🔴 «cae seguro». Al terminar ves las soluciones y qué te falta para el 10. No se guarda nada en el plan.
        </p>
        {last ? (
          <p role="status" className="rounded-lg border p-3 text-sm">
            Último intento: <strong>{fmt(last.score)}</strong> · {last.label}
            {last.weak.length ? ` · se reforzará: ${last.weak.slice(0, 3).join(", ")}` : ""}
          </p>
        ) : null}
        <div className="grid gap-1.5">
          <span id="st-count" className="text-sm font-medium">
            Preguntas
          </span>
          <div role="radiogroup" aria-labelledby="st-count" className="grid grid-cols-3 gap-2">
            {TEST_COUNTS.map((n) => (
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
        <Button className="min-h-11" disabled={busy} onClick={() => start(last?.weak ?? [])}>
          {busy ? "Redactando el test…" : "Empezar test"}
        </Button>
      </div>
    );

  if (phase === "quiz") {
    const q = qs[i];
    const last_ = i === qs.length - 1;
    const hasAnswer = q.kind === "choice" ? picked[i] !== undefined : true;
    return (
      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between text-sm">
            <span data-testid="st-progress">
              Pregunta {i + 1}/{qs.length}
            </span>
            <span className="text-muted-foreground">
              <span aria-label={TAG_LABEL[q.tag]}>{TAG_EMOJI[q.tag]}</span> {q.topic}
            </span>
          </div>
          <Progress value={((i + 1) / qs.length) * 100} aria-label="Progreso del test" />
        </div>
        <p className="text-xs font-medium uppercase text-muted-foreground">{q.kind === "case" ? "Caso práctico" : "Teoría"}</p>
        <h2 className="text-lg font-semibold">{q.question}</h2>
        {q.kind === "choice" ? (
          <div role="radiogroup" aria-label="Opciones" className="grid gap-2">
            {q.options.map((o, k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={picked[i] === k}
                onClick={() => setPicked({ ...picked, [i]: k })}
                className={cn("min-h-11 rounded-lg border p-3 text-left text-sm transition-colors", picked[i] === k ? "border-primary bg-primary/10 font-medium" : "bg-background hover:bg-accent")}
              >
                {o}
              </button>
            ))}
          </div>
        ) : (
          <Field label="Tu respuesta" htmlFor="st-case">
            <Textarea id="st-case" rows={5} maxLength={2000} value={written[i] ?? ""} onChange={(e) => setWritten({ ...written, [i]: e.target.value })} placeholder="Razona el caso aquí; luego verás la solución." />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="min-h-11" disabled={i === 0} onClick={() => setI(i - 1)}>
            Anterior
          </Button>
          {last_ ? (
            <Button className="min-h-11" disabled={!hasAnswer} onClick={finish}>
              Terminar
            </Button>
          ) : (
            <Button className="min-h-11" disabled={!hasAnswer} onClick={() => setI(i + 1)}>
              Siguiente
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (phase === "grade") {
    const cases = qs.map((q, n) => ({ q, n })).filter((x) => x.q.kind === "case");
    return (
      <div className="grid gap-4">
        <h2 className="text-lg font-semibold">Corrige tus casos prácticos</h2>
        <p className="text-sm text-muted-foreground">Compara tu respuesta con la solución de los apuntes y puntúate con sinceridad: es lo que decide tu nota.</p>
        {cases.map(({ q, n }) => (
          <section key={n} aria-label={`Caso ${n + 1}`} className="grid gap-2 rounded-lg border p-3">
            <p className="font-medium">{q.question}</p>
            <p className="text-sm text-muted-foreground">Tu respuesta: {written[n]?.trim() || "(en blanco)"}</p>
            <p className="rounded-md bg-muted p-2 text-sm">
              <strong>Solución:</strong> {q.solution}
            </p>
            <div role="radiogroup" aria-label="Tu puntuación" className="grid grid-cols-3 gap-2">
              {GRADES.map((g) => (
                <button
                  key={g.label}
                  type="button"
                  role="radio"
                  aria-checked={graded[n] === g.score}
                  onClick={() => setGraded({ ...graded, [n]: g.score })}
                  className={cn("min-h-11 rounded-md border px-2 text-sm transition-colors", graded[n] === g.score ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent")}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </section>
        ))}
        <Button className="min-h-11" disabled={cases.some((c) => graded[c.n] === undefined)} onClick={conclude}>
          Ver resultado
        </Button>
      </div>
    );
  }

  const l = level!;
  return (
    <div className="grid gap-4">
      <section aria-label="Nivel estimado" className="grid gap-1 rounded-lg border p-4 text-center">
        <p className="text-sm text-muted-foreground">Tu nivel estimado</p>
        <p data-testid="st-score" className="text-4xl font-bold">
          {fmt(l.score)}
          <span className="text-lg font-normal text-muted-foreground"> /10</span>
        </p>
        <p data-testid="st-label" className="font-medium">
          {l.label}
        </p>
        <p className="text-xs text-muted-foreground">Estimación a partir de {qs.length} preguntas: orienta, no es tu nota real.</p>
      </section>

      <section aria-label="Qué te falta para el 10" className="grid gap-2">
        <h2 className="text-lg font-semibold">Qué te falta para el 10</h2>
        {l.gaps.length || l.untested.length ? (
          <ul className="grid gap-2">
            {l.gaps.map((g) => (
              <li key={g.topic} className="rounded-lg border p-2 text-sm">
                <span aria-label={TAG_LABEL[g.tag]}>{TAG_EMOJI[g.tag]}</span> {g.topic} · repasa este tema
              </li>
            ))}
            {l.untested.map((t) => (
              <li key={t} className="rounded-lg border border-dashed p-2 text-sm">
                🔴 {t} · no ha salido en este test
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nada que reforzar en este test. Repite con más preguntas para confirmarlo.</p>
        )}
      </section>

      <section aria-label="Soluciones" className="grid gap-2">
        <h2 className="text-lg font-semibold">Soluciones</h2>
        {qs.map((q, n) => {
          const s = scoreOf(n);
          return (
            <article key={n} data-solution={n + 1} className="grid gap-1 rounded-lg border p-3 text-sm">
              <p className="font-medium">
                {n + 1}. {q.question}
              </p>
              <p className={s === 1 ? "text-green-700 dark:text-green-400" : s === 0.5 ? "text-amber-700 dark:text-amber-400" : "text-destructive"}>
                {s === 1 ? "Acertada" : s === 0.5 ? "A medias" : "Fallada"}
                {q.kind === "choice" && s !== 1 && picked[n] !== undefined ? ` · marcaste: ${q.options[picked[n]]}` : ""}
              </p>
              <p>
                <strong>Correcta:</strong> {q.solution}
              </p>
              <p className="text-muted-foreground">{q.explanation}</p>
              <p className="border-l-2 pl-2 text-xs text-muted-foreground">
                De tus apuntes: «{q.evidence}»{q.verified ? "" : " (cita no verificada: contrástala)"}
              </p>
            </article>
          );
        })}
      </section>

      <div className="grid grid-cols-2 gap-2">
        <Button className="min-h-11" disabled={busy} onClick={() => start(l.gaps.map((g) => g.topic))}>
          {busy ? "Redactando…" : "Repetir con lo flojo"}
        </Button>
        <Button asChild variant="outline" className="min-h-11">
          <Link href={`/study/modules/${moduleId}`}>Volver</Link>
        </Button>
      </div>
    </div>
  );
}
