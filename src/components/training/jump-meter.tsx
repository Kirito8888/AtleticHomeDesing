"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Chips, Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";
import { formatNum } from "@/lib/format";
import { CAPTURE_FPS, computeAttempt, effectiveFps, fpsWarning, frameToTime, isCaptureFps, JUMP_TYPES, type JumpFrames, type JumpType, nearestFps, SLOW_FPS, summarizeAttempts, videoWarnings } from "@/lib/training/jump";

const TYPE_OPTIONS = (Object.keys(JUMP_TYPES) as JumpType[]).map((k) => ({ value: k, label: k === "dj" ? "DJ" : k === "cmj" ? "CMJ" : k === "sj" ? "SJ" : "Abalakov" }));
const FPS_OPTIONS = CAPTURE_FPS.map((f) => ({ value: f as number, label: `${f} fps` }));
const SLOW_OPTIONS = SLOW_FPS.map((f) => ({ value: f as number, label: `${f} fps` }));
const YES_NO = [{ value: "no", label: "No" }, { value: "si", label: "Sí" }];

const CODEC_MSG =
  "Tu navegador no puede leer este vídeo (suele pasar con el HEVC del iPhone en un ordenador). Ábrelo desde el móvil o, en el iPhone, en Ajustes › Cámara › Formatos elige «Más compatible» (H.264) y vuelve a grabar.";
const errorMessage = (code?: number) => (code === 2 ? "Error de lectura del vídeo. Prueba con otro fichero." : CODEC_MSG);

/** Mide los fps del fichero reproduciéndolo en silencio unos fotogramas (requestVideoFrameCallback). */
function detectFileFps(v: HTMLVideoElement, rate = 0.25, timeoutMs = 2500): Promise<number | null> {
  return new Promise((resolve) => {
    if (!("requestVideoFrameCallback" in v)) return resolve(null);
    const times: number[] = [];
    let done = false;
    const stop = (r: number | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      v.pause();
      v.playbackRate = 1;
      resolve(r);
    };
    const measure = () => {
      // Si el navegador se salta fotogramas, los saltos agrandan el intervalo: el mínimo es el real.
      const d = times.slice(1).map((t, i) => t - times[i]).filter((x) => x > 0);
      return d.length >= 3 ? nearestFps(1 / Math.min(...d)) : null;
    };
    const timer = setTimeout(() => stop(measure()), timeoutMs);
    const tick = (_: number, meta: VideoFrameCallbackMetadata) => {
      times.push(meta.mediaTime);
      if (times.length >= 11) stop(measure());
      else v.requestVideoFrameCallback(tick);
    };
    v.muted = true;
    v.playbackRate = rate; // lento para que el navegador presente todos los fotogramas
    v.requestVideoFrameCallback(tick);
    v.play().catch(() => stop(null));
  });
}

type Marks = { contact: number | null; takeoff: number | null; landing: number | null };
const NO_MARKS: Marks = { contact: null, takeoff: null, landing: null };

/** Medidor de salto por tiempo de vuelo: el vídeo no sale del navegador; solo se guardan los resultados. */
export function JumpMeter({ today, onUseHeight }: { today: string; onUseHeight?: (heightCm: number) => void }) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [detected, setDetected] = useState<number | null>(null);
  const [recordedFps, setRecordedFps] = useState(240);
  const [manualFileFps, setManualFileFps] = useState<number | null>(null);
  const [slow, setSlow] = useState(false);
  const [duration, setDuration] = useState(0);
  const [type, setType] = useState<JumpType>(onUseHeight ? "sj" : "cmj");
  const [frame, setFrame] = useState(0);
  const [marks, setMarks] = useState<Marks>(NO_MARKS);
  const [attempts, setAttempts] = useState<JumpFrames[]>([]);
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  const [error, setError] = useState<string | null>(null);
  // Fps del fichero: medidos; si no se pueden medir, los indicados por la atleta (nunca un valor inventado).
  const fileFps = detected ?? manualFileFps ?? recordedFps;
  const maxFrame = Math.max(0, Math.floor(duration * fileFps) - 1);
  const fileFpsRef = useRef(fileFps);
  useEffect(() => { fileFpsRef.current = fileFps; }, [fileFps]);
  const target = useRef(0); // fotograma pedido más recientemente
  const seeking = useRef(false);
  const metaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);
  useEffect(() => () => { if (metaTimer.current) clearTimeout(metaTimer.current); }, []);

  /** Lanza un seek solo si no hay otro en curso; al terminar (`seeked`) se aplica el último objetivo pendiente. */
  function applySeek() {
    const v = video.current;
    if (!v) return;
    const t = frameToTime(target.current, fileFpsRef.current);
    if (Math.abs(v.currentTime - t) < 1e-6) return;
    seeking.current = true;
    v.currentTime = t;
  }

  function onSeeked() {
    seeking.current = false;
    const v = video.current;
    if (v && Math.abs(v.currentTime - frameToTime(target.current, fileFpsRef.current)) > 1e-6) applySeek();
  }

  function seek(n: number) {
    const f = Math.max(0, Math.min(maxFrame, n));
    setFrame(f);
    target.current = f;
    if (!seeking.current) applySeek();
  }

  function fail(code?: number) {
    if (metaTimer.current) clearTimeout(metaTimer.current);
    setError(errorMessage(code));
    setReady(false);
  }

  function pick(file: File | undefined) {
    if (!file) return;
    setSrc(URL.createObjectURL(file));
    setMarks(NO_MARKS);
    setAttempts([]);
    setFrame(0);
    target.current = 0;
    seeking.current = false;
    setDetected(null);
    setManualFileFps(null);
    setSlow(false);
    setReady(false);
    setError(null);
    if (metaTimer.current) clearTimeout(metaTimer.current);
    metaTimer.current = setTimeout(() => fail(), 8000); // sin metadatos en 8 s: códec no soportado
  }

  async function onLoaded() {
    if (metaTimer.current) clearTimeout(metaTimer.current);
    const v = video.current!;
    let d = await detectFileFps(v);
    if (d == null) d = await detectFileFps(v, 0.1, 4000); // 4K/HEVC: reintento más lento
    setDuration(v.duration);
    const ok = d && isCaptureFps(d) ? d : null;
    setDetected(ok);
    fileFpsRef.current = ok ?? recordedFps;
    // Propuesta: si los fps del fichero son de captura habituales, se proponen también como fps de grabación.
    if (d && isCaptureFps(d)) setRecordedFps(d);
    seeking.current = false;
    target.current = 0;
    v.currentTime = frameToTime(0, fileFpsRef.current);
    setReady(true);
  }

  function changeFileFps(f: number) {
    setManualFileFps(f);
    fileFpsRef.current = f;
    setMarks(NO_MARKS);
    setAttempts([]);
    seek(0);
  }

  const m = marks;
  const frames: JumpFrames | null =
    m.takeoff != null && m.landing != null && m.landing > m.takeoff && (type !== "dj" || (m.contact != null && m.contact < m.takeoff))
      ? { takeoff: m.takeoff, landing: m.landing, contact: type === "dj" ? m.contact : null }
      : null;
  const setup = { fileFps, detected: detected != null, recordedFps, slowMotion: slow };
  const fps = effectiveFps(setup);
  const current = frames ? computeAttempt(type, fps, frames) : null;
  const all = attempts.map((a) => computeAttempt(type, fps, a));
  const sum = summarizeAttempts(type, all);
  const warnings = [...(ready ? videoWarnings(setup, frames ? frames.landing - frames.takeoff : null) : []), fpsWarning(fps, current?.flightS)].filter((w): w is string => !!w);
  const unit = type === "dj" ? "m/s" : "cm";

  function addAttempt() {
    if (!frames) return;
    setAttempts([...attempts, frames]);
    setMarks(NO_MARKS);
  }

  async function save() {
    setBusy(true);
    try {
      await api("/api/training/tests/jump", { body: { type, fps, date, attempts } });
      toast.success("Intentos guardados");
      router.push("/training/tests");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  const step = (label: string, d: number) => (
    <Button type="button" variant="outline" className="min-h-11 flex-1 tabular-nums" onClick={() => seek(frame + d)} disabled={!ready}>
      {label}
    </Button>
  );

  return (
    <div className="grid gap-4">
      {onUseHeight ? null : <Chips label="Tipo de salto" options={TYPE_OPTIONS} value={type} onChange={(v) => { if (v) { setType(v); setMarks(NO_MARKS); setAttempts([]); } }} />}
      <Field label="Vídeo del salto (se queda en tu móvil; no se sube)" htmlFor="j-file">
        <Input id="j-file" type="file" accept="video/*,video/mp4,video/quicktime" onChange={(e) => pick(e.target.files?.[0])} />
      </Field>
      {src ? (
        <>
          <video
            key={src}
            ref={video}
            src={src}
            playsInline
            {...{ "webkit-playsinline": "true" }}
            muted
            preload="auto"
            onLoadedMetadata={() => void onLoaded()}
            onSeeked={onSeeked}
            onError={(e) => fail(e.currentTarget.error?.code)}
            className={error ? "hidden" : "w-full rounded-md bg-black"}
            aria-label="Vídeo del salto"
          />
          {error ? <p role="alert" className="rounded-md border border-destructive/40 p-2 text-sm">{error}</p> : null}
        </>
      ) : null}
      {src && !error ? (
        <>
          <p className="text-sm tabular-nums" aria-live="polite">
            Fotograma <strong>{frame}</strong> de {maxFrame} · {formatNum(frame / fps, 2)} s
          </p>
          <input
            type="range"
            min={0}
            max={maxFrame}
            step={1}
            value={frame}
            disabled={!ready}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Fotograma"
            aria-valuetext={`Fotograma ${frame}, ${formatNum(frame / fps, 2)} s`}
            className="h-11 w-full"
          />
          <div className="flex gap-2" role="group" aria-label="Avance fotograma a fotograma">
            {step("−10", -10)}
            {step("−1", -1)}
            {step("+1", 1)}
            {step("+10", 10)}
          </div>
          <p className="text-sm" aria-live="polite">
            {!ready ? "Analizando el vídeo…" : detected ? `El fichero tiene ${detected} fps.` : "No se pudieron detectar los fps del fichero: indícalos abajo."}
          </p>
          {ready && !detected ? (
            <Field label="Fps del fichero" hint="Mira las propiedades del vídeo en el móvil (Información). Con ellos se numeran los fotogramas.">
              <Chips label="Fps del fichero" options={FPS_OPTIONS} value={manualFileFps ?? recordedFps} onChange={(v) => v && changeFileFps(v)} />
            </Field>
          ) : null}
          <Field label="Fps a los que grabaste" hint="Con vídeo a velocidad real el cálculo usa los fps del fichero, no estos.">
            <Chips label="Fps de grabación" options={FPS_OPTIONS} value={recordedFps} onChange={(v) => v && setRecordedFps(v)} />
          </Field>
          <Field label="¿El salto se ve a cámara lenta en el vídeo?" hint="La cámara lenta del iPhone solo ralentiza un tramo: despegue y aterrizaje deben quedar dentro de él.">
            <Chips label="Cámara lenta" options={YES_NO} value={slow ? "si" : "no"} onChange={(v) => { if (v) { setSlow(v === "si"); if (v === "si" && recordedFps < 120) setRecordedFps(240); } }} />
          </Field>
          {slow ? <Chips label="Fps de la cámara lenta" options={SLOW_OPTIONS} value={recordedFps} onChange={(v) => v && setRecordedFps(v)} /> : null}
          <p className="text-xs text-muted-foreground">Se calcula con {fps} fps ({slow ? "cámara lenta" : "fps del fichero"}).</p>
          {warnings.map((w) => (
            <p key={w} role="alert" className="rounded-md border border-destructive/40 p-2 text-sm">{w}</p>
          ))}
          <div className="grid grid-cols-2 gap-2">
            {type === "dj" ? (
              <Button type="button" variant={m.contact != null ? "secondary" : "outline"} className="col-span-2 min-h-11" onClick={() => setMarks({ ...m, contact: frame })}>
                Marcar contacto{m.contact != null ? ` (${m.contact})` : ""}
              </Button>
            ) : null}
            <Button type="button" variant={m.takeoff != null ? "secondary" : "outline"} className="min-h-11" onClick={() => setMarks({ ...m, takeoff: frame })}>
              Marcar despegue{m.takeoff != null ? ` (${m.takeoff})` : ""}
            </Button>
            <Button type="button" variant={m.landing != null ? "secondary" : "outline"} className="min-h-11" onClick={() => setMarks({ ...m, landing: frame })}>
              Marcar aterrizaje{m.landing != null ? ` (${m.landing})` : ""}
            </Button>
          </div>
          <div className="rounded-md border p-3 text-sm" aria-live="polite" data-testid="jump-result">
            {current ? (
              <>
                <p>
                  Altura: <strong className="tabular-nums">{formatNum(current.heightCm, 1)} cm</strong> · Velocidad de despegue: <strong className="tabular-nums">{formatNum(current.velocity, 2)} m/s</strong>
                </p>
                <p className="text-muted-foreground">Tiempo de vuelo {formatNum(current.flightS, 2)} s{current.rsi ? ` · contacto ${formatNum(current.contactS, 2)} s · RSI ${formatNum(current.rsi, 2)}` : ""}</p>
              </>
            ) : (
              <p className="text-muted-foreground">Marca {type === "dj" ? "contacto, " : ""}despegue y aterrizaje para ver el resultado.</p>
            )}
          </div>
          <Button type="button" onClick={addAttempt} disabled={!frames || !ready} className="min-h-11">
            Añadir intento
          </Button>
        </>
      ) : null}
      {all.length ? (
        <div className="grid gap-2">
          <ul className="grid gap-1 text-sm" aria-label="Intentos">
            {all.map((a, i) => (
              <li key={i} className="flex items-center justify-between gap-2 tabular-nums">
                <span>
                  {i + 1}. {type === "dj" ? `RSI ${formatNum(a.rsi, 2)}` : `${formatNum(a.heightCm, 1)} cm`} · {formatNum(a.velocity, 2)} m/s
                </span>
                <Button type="button" variant="ghost" className="min-h-11" aria-label={`Quitar intento ${i + 1}`} onClick={() => setAttempts(attempts.filter((_, j) => j !== i))}>
                  Quitar
                </Button>
              </li>
            ))}
          </ul>
          {sum ? (
            <p className="text-sm">
              Mejor: <strong className="tabular-nums">{formatNum(sum.bestValue, type === "dj" ? 2 : 1)} {unit}</strong> · media: <strong className="tabular-nums">{formatNum(sum.mean, type === "dj" ? 2 : 1)} {unit}</strong>
            </p>
          ) : null}
          {onUseHeight ? (
            <Button type="button" onClick={() => sum && onUseHeight(Math.round(sum.bestValue * 10) / 10)} disabled={!sum} className="min-h-11">
              Usar {sum ? formatNum(sum.bestValue, 1) : ""} cm (mejor intento)
            </Button>
          ) : (
            <>
              <Field label="Fecha" htmlFor="j-date">
                <Input id="j-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Button type="button" onClick={save} disabled={busy} className="min-h-11">
                Guardar {all.length} intento{all.length === 1 ? "" : "s"}
              </Button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
