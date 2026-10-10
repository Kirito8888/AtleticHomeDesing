"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Chips, Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/client-api";
import { formatDate } from "@/lib/format";
import { GOAL_KIND_LABEL, GOAL_KINDS, goalValue, type GoalKindKey, type GoalProgress } from "@/lib/goals/goals";

export type GoalOptions = {
  events: Array<{ value: string; label: string }>;
  tests: Array<{ value: string; label: string; unit: string; higherIsBetter: boolean }>;
  habits: Array<{ value: string; label: string }>;
  categories: Array<{ value: string; label: string }>;
};

export type GoalRow = { id: string; kind: GoalKindKey; title: string; target: number; unit: string | null; dueOn: string | null; doneAt: string | null; progress: GoalProgress };

export function NewGoal({ options }: { options: GoalOptions }) {
  const router = useRouter();
  const [kind, setKind] = useState<GoalKindKey>("MARK");
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [target, setTarget] = useState("");
  const [lower, setLower] = useState(false);
  const [unit, setUnit] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const linkOptions = kind === "MARK" ? options.events : kind === "TEST" ? options.tests : kind === "HABIT" ? options.habits : kind === "BUDGET" ? options.categories : [];
  const test = options.tests.find((t) => t.value === link);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(target.replace(",", "."));
    if (!(n > 0)) return toast.error("Pon un objetivo numérico");
    setBusy(true);
    try {
      await api("/api/goals", {
        body: {
          kind,
          title: title.trim() || `${GOAL_KIND_LABEL[kind]}: ${linkOptions.find((o) => o.value === link)?.label ?? ""}`.slice(0, 80),
          target: kind === "BUDGET" ? Math.round(n * 100) : n,
          linkRef: kind === "CUSTOM" ? null : link || null,
          higherIsBetter: kind === "TEST" ? (test?.higherIsBetter ?? true) : !lower,
          unit: kind === "TEST" ? (test?.unit ?? null) : kind === "MARK" ? "m" : unit || null,
          dueOn: due || null,
        },
      });
      toast.success("Objetivo creado");
      setTitle("");
      setTarget("");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="grid gap-3 text-sm">
      <Chips
        label="Tipo de objetivo"
        options={GOAL_KINDS.map((k) => ({ value: k, label: GOAL_KIND_LABEL[k] }))}
        value={kind}
        onChange={(k) => {
          if (!k) return;
          setKind(k);
          setLink("");
        }}
      />
      {kind !== "CUSTOM" ? (
        <Field label={kind === "MARK" ? "Prueba" : kind === "TEST" ? "Test" : kind === "HABIT" ? "Hábito" : "Categoría"} htmlFor="goal-link">
          <Select id="goal-link" value={link} onChange={(e) => setLink(e.target.value)} required>
            <option value="">Elige…</option>
            {linkOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field label="Nombre (opcional)" htmlFor="goal-title">
        <Input id="goal-title" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "CUSTOM" ? "p. ej. Leer 12 libros" : "Se pone solo si lo dejas vacío"} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={kind === "BUDGET" ? "Máximo al mes (€)" : kind === "HABIT" ? "Días seguidos" : `Objetivo${kind === "TEST" && test ? ` (${test.unit})` : kind === "MARK" ? " (m)" : ""}`} htmlFor="goal-target">
          <Input id="goal-target" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} required />
        </Field>
        <Field label="Para (opcional)" htmlFor="goal-due">
          <Input id="goal-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
      </div>
      {kind === "CUSTOM" ? (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Unidad" htmlFor="goal-unit">
            <Input id="goal-unit" maxLength={12} value={unit} onChange={(e) => setUnit(e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2">
            <input type="checkbox" className="size-4" checked={lower} onChange={() => setLower(!lower)} /> Menos es mejor
          </label>
        </div>
      ) : null}
      <Button type="submit" disabled={busy} className="justify-self-start">
        Crear objetivo
      </Button>
    </form>
  );
}

export function GoalList({ goals }: { goals: GoalRow[] }) {
  const router = useRouter();
  async function act(url: string, init: { method: string; body?: unknown }, ok: string) {
    try {
      await api(url, init);
      toast.success(ok);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  if (!goals.length) return <p className="text-sm text-muted-foreground">Todavía no tienes objetivos.</p>;
  return (
    <ul className="grid gap-3" aria-label="Objetivos">
      {goals.map((g) => (
        <li key={g.id} className="grid gap-1.5 rounded-md border p-3 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium">{g.title}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{g.doneAt ? "✓ conseguido" : g.dueOn ? `para el ${formatDate(g.dueOn, { day: "numeric", month: "short", year: "numeric" })}` : ""}</span>
          </div>
          <Progress value={g.progress.pct * 100} aria-label={`Progreso de ${g.title}`} className={g.kind === "BUDGET" && !g.progress.reached ? "[&>div]:bg-destructive" : undefined} />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {goalValue(g.kind, g.progress.current, g.unit)} de {goalValue(g.kind, g.target, g.unit)}
              {g.progress.reached && g.kind !== "BUDGET" && !g.doneAt ? " · ¡alcanzado!" : ""}
            </span>
            <span className="flex gap-1">
              {g.kind === "CUSTOM" && !g.doneAt ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const v = prompt("Valor actual", String(g.progress.current ?? 0));
                    if (v != null && Number.isFinite(Number(v.replace(",", ".")))) void act(`/api/goals/${g.id}`, { method: "PATCH", body: { current: Number(v.replace(",", ".")) } }, "Progreso actualizado");
                  }}
                >
                  Actualizar
                </Button>
              ) : null}
              <Button type="button" size="sm" variant="outline" onClick={() => act(`/api/goals/${g.id}`, { method: "PATCH", body: { done: !g.doneAt } }, g.doneAt ? "Reabierto" : "¡Conseguido!")}>
                {g.doneAt ? "Reabrir" : "Conseguido"}
              </Button>
              <Button type="button" size="sm" variant="ghost" aria-label={`Borrar ${g.title}`} onClick={() => confirm("¿Borrar este objetivo?") && act(`/api/goals/${g.id}`, { method: "DELETE" }, "Objetivo borrado")}>
                Borrar
              </Button>
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
