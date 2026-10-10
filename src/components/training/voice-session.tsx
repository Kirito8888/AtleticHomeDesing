"use client";

import { useState } from "react";
import { toast } from "sonner";

import { type AutoregContext, type ExerciseOption } from "@/components/training/strength-logger";
import { SessionForm } from "@/components/training/session-form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/client-api";
import type { FormKind, SessionFormInitial } from "@/lib/training/form-initial";

type Draft = { durationMin: number | null; rpe: number | null; blocks: Array<{ exerciseId: string; exercise: string; sets: number; reps: number; kg: number | null; rir: number | null }>; unmatched: string[]; source: string };

type SpeechCtor = new () => {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

/**
 * Formulario de sesión con «Dictar»: el navegador transcribe (el audio no sale
 * del móvil), el texto se convierte en un borrador y se revisa antes de guardar.
 */
export function VoiceSessionForm(props: { exercises: ExerciseOption[]; defaultDate: string; bodyWeightKg: number | null; initialType: FormKind; initial?: SessionFormInitial; formKey: string; autoreg?: AutoregContext }) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [initial, setInitial] = useState(props.initial);
  const [key, setKey] = useState(props.formKey);
  // Al elegir una plantilla o «registrar desde el plan» cambian las props: manda lo nuevo
  const [propKey, setPropKey] = useState(props.formKey);
  if (propKey !== props.formKey) {
    setPropKey(props.formKey);
    setInitial(props.initial);
    setKey(props.formKey);
  }

  function listen() {
    const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return toast.error("Este navegador no permite dictar: escríbelo en el cuadro");
    const r = new Ctor();
    r.lang = "es-ES";
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e) => setText((t) => `${t} ${Array.from(e.results).map((x) => x[0].transcript).join(" ")}`.trim());
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    setListening(true);
    r.start();
  }

  async function convert() {
    setBusy(true);
    try {
      const d = await api<Draft>("/api/ai/voice", { body: { text } });
      if (!d.blocks.length) return toast.error(d.unmatched.length ? `No encuentro en el catálogo: ${d.unmatched.join(", ")}` : "No he entendido ejercicios con series × repeticiones");
      setInitial({
        type: "STRENGTH",
        date: props.defaultDate,
        title: "",
        minutes: d.durationMin ? String(d.durationMin) : "",
        rpe: d.rpe,
        notes: text,
        planned: false,
        blocks: d.blocks.map((b, i) => ({
          key: `voz${i}`,
          exerciseId: b.exerciseId,
          sets: Array.from({ length: b.sets }, () => ({ reps: b.reps, weightKg: b.kg ?? 0, rpe: b.rir != null ? 10 - b.rir : null, isWarmup: false })),
        })),
      });
      setKey(`voz-${Date.now()}`);
      toast.success(`Borrador listo${d.unmatched.length ? ` (sin encontrar: ${d.unmatched.join(", ")})` : ""}: revísalo y guarda`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <details className="mb-4 rounded-md border p-3 text-sm">
        <summary className="cursor-pointer font-medium">🎙 Dictar la sesión de fuerza</summary>
        <div className="mt-2 grid gap-2">
          <Textarea aria-label="Texto dictado" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder="Sentadilla 3 por 5 a 90 kilos RIR 2, press banca 4 por 6 con 60, 50 minutos, RPE 7" />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={listening} onClick={listen}>
              {listening ? "Escuchando…" : "🎙 Dictar"}
            </Button>
            <Button type="button" size="sm" disabled={busy || text.trim().length < 3} onClick={convert}>
              Convertir en sesión
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">El audio lo transcribe tu navegador. Al servidor solo llega el texto; si tienes la IA activada, tu IA lo convierte, y si no, la app lo interpreta sola.</p>
        </div>
      </details>
      <SessionForm key={key} exercises={props.exercises} defaultDate={props.defaultDate} bodyWeightKg={props.bodyWeightKg} initialType={props.initialType} initial={initial} autoreg={props.autoreg} />
    </>
  );
}
