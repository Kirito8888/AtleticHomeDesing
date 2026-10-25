"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, FileText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/client-api";
import { formatInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TAG_EMOJI, TAG_LABEL, type Tag } from "@/lib/study/adhd-report";

import { daysLabel } from "./modules-panel";

export interface DetailTopic {
  id: string;
  name: string;
  tag: Tag;
  minutes: number;
  done: boolean;
  order?: number;
  day?: number | null;
  overflow?: boolean;
}
export interface ModuleDetailData {
  id: string;
  name: string;
  examDate: string | null;
  daysLeft: number | null;
  prepMode: boolean;
  dailyMin: number;
  topics: DetailTopic[];
  route: DetailTopic[] | null;
  documents: { id: string; title: string }[];
  unassigned: { id: string; title: string }[];
}

const TAGS: Tag[] = ["red", "yellow", "grey"];

/** v2.5 · Detalle de la asignatura: fecha, modo preparación, temas con prioridad y apuntes. */
export function ModuleDetail({ data }: { data: ModuleDetailData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [topic, setTopic] = useState("");
  const [tag, setTag] = useState<Tag>("yellow");
  const [minutes, setMinutes] = useState("30");
  const [pick, setPick] = useState("");

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const patch = (body: unknown) => api(`/api/study/modules/${data.id}`, { method: "PATCH", body });
  const list: DetailTopic[] = data.route ?? data.topics;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 rounded-lg border p-3">
        <Field label="Fecha del examen" htmlFor="mod-exam" hint={daysLabel(data.daysLeft)}>
          <Input id="mod-exam" type="date" defaultValue={data.examDate ?? ""} disabled={busy} onChange={(e) => run(() => patch({ examDate: e.target.value || null }))} />
        </Field>
        <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-medium">
          <span>
            Modo preparación
            <span className="block text-xs font-normal text-muted-foreground">Reordena todo el temario: más nota por minuto, según los días que quedan.</span>
          </span>
          <Switch checked={data.prepMode} disabled={busy} onCheckedChange={(v) => run(() => patch({ prepMode: v }))} />
        </label>
      </div>

      <section aria-label="Temas" className="grid gap-2">
        <h2 className="text-lg font-semibold">{data.prepMode ? "Ruta de estudio" : "Temas"}</h2>
        {data.prepMode && data.daysLeft !== null ? (
          <p role="status" className="text-sm text-muted-foreground">
            {daysLabel(data.daysLeft)} · {formatInt(data.dailyMin)} min al día. Lo que no llega queda al final, marcado: no se quita nada.
          </p>
        ) : data.prepMode ? (
          <p role="status" className="text-sm text-muted-foreground">Pon la fecha del examen para que la ruta tenga en cuenta el tiempo.</p>
        ) : null}
        {list.length ? (
          <ol className="grid gap-2">
            {list.map((t) => (
              <li key={t.id} data-topic={t.name} className={cn("flex min-h-14 items-center gap-2 rounded-lg border p-2", t.overflow && "border-dashed")}>
                <Button
                  size="icon"
                  variant={t.done ? "default" : "outline"}
                  role="checkbox"
                  aria-checked={t.done}
                  aria-label={`${t.done ? "Reabrir" : "Hecho"}: ${t.name}`}
                  disabled={busy}
                  onClick={() => run(() => api(`/api/study/topics/${t.id}`, { method: "PATCH", body: { done: !t.done } }))}
                >
                  <Check />
                </Button>
                <div className="min-w-0 flex-1">
                  <div className={cn("truncate font-medium", t.done && "text-muted-foreground line-through")}>
                    <span aria-label={TAG_LABEL[t.tag]}>{TAG_EMOJI[t.tag]}</span> {t.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatInt(t.minutes)} min
                    {data.prepMode && t.day ? ` · día ${t.day}` : ""}
                    {t.overflow ? " · no llega antes del examen" : ""}
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Borrar ${t.name}`}
                  disabled={busy}
                  onClick={async () => (await confirmDialog({ title: `¿Borrar el tema «${t.name}»?`, confirmLabel: "Borrar", destructive: true })) && run(() => api(`/api/study/topics/${t.id}`, { method: "DELETE" }))}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">Aún no hay temas: añade uno o mete un apunte.</p>
        )}
        <form
          className="grid gap-3 rounded-lg border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await api(`/api/study/modules/${data.id}/topics`, { body: { name: topic, tag, minutes: Number(minutes) || 30 } });
              setTopic("");
            }, "Tema añadido");
          }}
        >
          <Field label="Nuevo tema" htmlFor="topic-name">
            <Input id="topic-name" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Ciclo de Krebs" maxLength={120} required />
          </Field>
          <div className="grid gap-1.5">
            <span id="topic-tag-label" className="text-sm font-medium">
              Prioridad
            </span>
            <div role="radiogroup" aria-labelledby="topic-tag-label" className="grid grid-cols-3 gap-2">
              {TAGS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={tag === k}
                  onClick={() => setTag(k)}
                  className={cn("min-h-11 rounded-md border px-2 text-sm transition-colors", tag === k ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent")}
                >
                  {TAG_EMOJI[k]} {TAG_LABEL[k]}
                </button>
              ))}
            </div>
          </div>
          <Field label="Minutos estimados" htmlFor="topic-min">
            <Input id="topic-min" type="number" inputMode="numeric" min={5} max={600} step={5} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </Field>
          <Button type="submit" disabled={busy || !topic.trim()}>
            <Plus /> Añadir tema
          </Button>
        </form>
      </section>

      <section aria-label="Apuntes" className="grid gap-2">
        <h2 className="text-lg font-semibold">Apuntes</h2>
        {data.documents.length ? (
          <ul className="grid gap-2">
            {data.documents.map((d) => (
              <li key={d.id} className="flex min-h-11 items-center gap-2 rounded-lg border p-2">
                <FileText className="size-5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{d.title}</span>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => api(`/api/study/modules/${data.id}/documents`, { method: "DELETE", body: { documentId: d.id } }), "Apunte fuera de la asignatura")}>
                  Quitar
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Sin apuntes. Súbelos en «Apuntes» eligiendo esta asignatura, o mete uno ya subido.</p>
        )}
        {data.unassigned.length ? (
          <div className="grid gap-2 rounded-lg border p-3">
            <Field label="Meter un apunte ya subido" htmlFor="doc-pick">
              <Select id="doc-pick" value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">Elige un apunte…</option>
                {data.unassigned.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              disabled={busy || !pick}
              onClick={() =>
                run(async () => {
                  await api(`/api/study/modules/${data.id}/documents`, { body: { documentId: pick } });
                  setPick("");
                }, "Apunte añadido, con su tema")
              }
            >
              Meter apunte
            </Button>
          </div>
        ) : null}
      </section>

      <Button
        variant="outline"
        className="text-destructive"
        disabled={busy}
        onClick={async () => {
          if (!(await confirmDialog({ title: `¿Borrar la asignatura «${data.name}»?`, description: "Se borran sus temas; los apuntes se conservan.", confirmLabel: "Borrar", destructive: true }))) return;
          await run(() => api(`/api/study/modules/${data.id}`, { method: "DELETE" }), "Asignatura borrada");
          router.push("/study?tab=modules");
        }}
      >
        <Trash2 /> Borrar asignatura
      </Button>
    </div>
  );
}
