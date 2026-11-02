"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpenCheck, Gamepad2, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { ExamFormatForm } from "@/components/study/pack/exam-format-form";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";
import { formatInt } from "@/lib/format";
import { KIND_LABEL, activeKinds, type ExamFormat } from "@/lib/study/exam-format";

interface PackView {
  status: string;
  error: string | null;
  meta: { done: number; total: number; failed: { part: string; error: string }[]; truncated?: boolean } | null;
  hasSummary: boolean;
  questions: number;
}
const RUNNING = new Set(["PENDING", "RUNNING"]);

/**
 * v2.6 · Paquete de estudio por tema: resumen por prioridad + banco del juego, generados en segundo plano a partir de los apuntes.
 * Antes de la primera generación pregunta cómo es el examen. Mientras corre, consulta el avance cada 3 s (sin `router.refresh`).
 */
export function PackSection({
  moduleId,
  topics,
  documents,
  initialPacks,
  examFormat,
  examFormatSet,
}: {
  moduleId: string;
  topics: { id: string; name: string }[];
  documents: { id: string; title: string }[];
  initialPacks: Record<string, { status: string; hasSummary: boolean }>;
  examFormat: ExamFormat;
  examFormatSet: boolean;
}) {
  const [packs, setPacks] = useState<Record<string, PackView>>(() =>
    Object.fromEntries(Object.entries(initialPacks).map(([id, p]) => [id, { status: p.status, error: null, meta: null, hasSummary: p.hasSummary, questions: 0 }])),
  );
  const [format, setFormat] = useState(examFormat);
  const [formatSet, setFormatSet] = useState(examFormatSet);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [extra, setExtra] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async (id: string) => {
    try {
      const r = await api<{ pack: { status: string; error: string | null; meta: PackView["meta"]; summary: unknown; questions: number } | null }>(`/api/ai/study/pack/${id}`);
      if (r.pack) setPacks((p) => ({ ...p, [id]: { status: r.pack!.status, error: r.pack!.error, meta: r.pack!.meta, hasSummary: r.pack!.summary !== null, questions: r.pack!.questions } }));
    } catch {
      /* un fallo de red puntual no corta el seguimiento */
    }
  }, []);

  const runningIds = Object.entries(packs)
    .filter(([, p]) => RUNNING.has(p.status))
    .map(([id]) => id)
    .join(",");
  const ids = useRef<string[]>([]);
  useEffect(() => {
    ids.current = runningIds ? runningIds.split(",") : [];
    if (!ids.current.length) return;
    const t = setInterval(() => ids.current.forEach((id) => void refresh(id)), 3000);
    return () => clearInterval(t);
  }, [runningIds, refresh]);
  // Al montar, completa el avance de los que ya vienen en curso o terminados.
  useEffect(() => {
    Object.keys(initialPacks).forEach((id) => void refresh(id));
  }, [initialPacks, refresh]);

  async function start(topicId: string, force = false) {
    if (!formatSet) {
      setPending(topicId);
      setEditing(true);
      toast.message("Antes de generar, cuéntame cómo es tu examen.");
      return;
    }
    setBusy(topicId);
    try {
      await api(`/api/ai/study/pack`, { body: { topicId, ...(extra.length ? { documentIds: extra } : {}), ...(force ? { force: true } : {}) } });
      setPacks((p) => ({ ...p, [topicId]: { status: "PENDING", error: null, meta: null, hasSummary: p[topicId]?.hasSummary ?? false, questions: p[topicId]?.questions ?? 0 } }));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const kinds = activeKinds(format);
  return (
    <section aria-label="Paquete de estudio" className="grid gap-2" data-testid="pack-section">
      <h2 className="text-lg font-semibold">Paquete de estudio (IA)</h2>
      <p className="text-sm text-muted-foreground">
        De los apuntes de cada tema sale un <b>resumen por prioridad</b> y las <b>preguntas del Modo Juego</b>. Se genera en segundo plano, por partes, y solo con lo que dicen tus apuntes.
      </p>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
        <span className="min-w-0 flex-1">
          {formatSet ? (
            <>
              Examen: <b>{kinds.map((k) => KIND_LABEL[k]).join(" · ")}</b> · {formatInt(format.questions)} preguntas · {formatInt(format.minutes)} min
            </>
          ) : (
            <>Aún no has dicho cómo es tu examen.</>
          )}
        </span>
        <Button size="sm" variant="outline" className="min-h-11" onClick={() => setEditing((v) => !v)} data-testid="exam-format-toggle">
          {formatSet ? "Cambiar" : "Responder"}
        </Button>
      </div>
      {editing ? (
        <ExamFormatForm
          moduleId={moduleId}
          initial={format}
          onSaved={(f) => {
            setFormat(f);
            setFormatSet(true);
            setEditing(false);
            if (pending) {
              const id = pending;
              setPending(null);
              // `formatSet` aún es el valor viejo en este render: se lanza con el siguiente.
              setTimeout(() => void api(`/api/ai/study/pack`, { body: { topicId: id, ...(extra.length ? { documentIds: extra } : {}) } }).then(() => setPacks((p) => ({ ...p, [id]: { status: "PENDING", error: null, meta: null, hasSummary: false, questions: 0 } }))).catch((e: Error) => toast.error(e.message)), 0);
            }
          }}
        />
      ) : null}

      {documents.length > 1 ? (
        <fieldset className="grid gap-1 rounded-lg border p-2">
          <legend className="px-1 text-sm font-medium">Sumar otros apuntes al generar (p. ej. el PDF y el PPTX del mismo tema)</legend>
          {documents.map((d) => (
            <label key={d.id} className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" className="size-5" checked={extra.includes(d.id)} onChange={(e) => setExtra((x) => (e.target.checked ? [...x, d.id] : x.filter((y) => y !== d.id)))} />
              <span className="min-w-0 truncate">{d.title}</span>
            </label>
          ))}
        </fieldset>
      ) : null}

      {topics.length ? (
        <ul className="grid gap-2">
          {topics.map((t) => {
            const p = packs[t.id];
            const running = p && RUNNING.has(p.status);
            const failed = p?.meta?.failed.length ?? 0;
            return (
              <li key={t.id} data-pack={t.name} className="grid gap-2 rounded-lg border p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
                  {running ? (
                    <span role="status" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground" data-testid="pack-progress">
                      <Loader2 className="size-4 animate-spin" aria-hidden /> Generando {p.meta ? `${p.meta.done}/${p.meta.total}` : "…"}
                    </span>
                  ) : p?.status === "READY" ? (
                    <span className="text-sm text-green-700 dark:text-green-400" data-testid="pack-ready">
                      ✔ Listo · {formatInt(p.questions)} preguntas
                    </span>
                  ) : p?.status === "PARTIAL" ? (
                    <span className="text-sm text-amber-700 dark:text-amber-400" data-testid="pack-partial">
                      ⚠ Parcial · {formatInt(failed)} {failed === 1 ? "parte falló" : "partes fallaron"}
                    </span>
                  ) : p?.status === "FAILED" ? (
                    <span className="text-sm text-destructive" data-testid="pack-failed">
                      ✘ No se pudo generar
                    </span>
                  ) : null}
                </div>
                {p?.status === "FAILED" && p.error ? <p className="text-xs text-destructive">{p.error}</p> : null}
                {p?.status === "PARTIAL" && p.meta?.failed[0] ? <p className="text-xs text-muted-foreground">Falló: {p.meta.failed[0].error}</p> : null}
                {p?.meta?.truncated ? <p className="text-xs text-muted-foreground">El tema es muy largo: el resumen usa solo los primeros ~150 000 caracteres.</p> : null}
                <div className="flex flex-wrap gap-2">
                  {!running ? (
                    <Button size="sm" className="min-h-11" disabled={busy === t.id} onClick={() => start(t.id)} data-testid="pack-generate">
                      {p?.status === "PARTIAL" || p?.status === "FAILED" ? <RefreshCw /> : <Sparkles />}
                      {p?.status === "PARTIAL" || p?.status === "FAILED" ? "Reintentar lo que falta" : p ? "Regenerar si cambió" : "Generar paquete"}
                    </Button>
                  ) : null}
                  {p && !running && p.status !== "PENDING" ? (
                    <Button size="sm" variant="ghost" className="min-h-11" disabled={busy === t.id} onClick={() => start(t.id, true)}>
                      Empezar de cero
                    </Button>
                  ) : null}
                  {p?.hasSummary ? (
                    <Button asChild size="sm" variant="outline" className="min-h-11">
                      <Link href={`/study/modules/${moduleId}/topics/${t.id}/summary`} data-testid="pack-summary-link">
                        <BookOpenCheck /> Resumen
                      </Link>
                    </Button>
                  ) : null}
                  {p && p.questions > 0 ? (
                    <Button asChild size="sm" variant="outline" className="min-h-11">
                      <Link href={`/study/modules/${moduleId}/quest/play?level=${t.id}`}>
                        <Gamepad2 /> Jugar
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Añade temas (o mete un apunte) para generar su paquete.</p>
      )}
    </section>
  );
}
