"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Chips, Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/client-api";
import { ASSIGNMENT_STATUS, type AssignmentStatus } from "@/lib/study/v17-study";

/** 22 · Tarjetas a mano (sin IA): una a una o pegando «pregunta | respuesta» por línea. */
export function ManualCards({ decks }: { decks: string[] }) {
  const router = useRouter();
  const [deck, setDeck] = useState(decks[0] ?? "");
  const [lines, setLines] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-2 rounded-md border p-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const r = await api<{ added: number }>("/api/study/cards", { body: { deck: deck.trim(), lines } });
          toast.success(`${r.added} tarjetas añadidas a «${deck.trim()}»`);
          setLines("");
          router.refresh();
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="font-medium">Crear tarjetas a mano (sin IA)</p>
      <Field label="Mazo" htmlFor="mc-deck" hint="Si no existe, se crea">
        <Input id="mc-deck" list="mc-decks" maxLength={60} value={deck} onChange={(e) => setDeck(e.target.value)} />
      </Field>
      <datalist id="mc-decks">
        {decks.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>
      <Field label="Tarjetas" htmlFor="mc-lines" hint="Una por línea: pregunta | respuesta">
        <Textarea id="mc-lines" rows={4} value={lines} onChange={(e) => setLines(e.target.value)} placeholder={"¿Capital de Portugal? | Lisboa\nFórmula del agua | H2O"} />
      </Field>
      <Button type="submit" variant="outline" disabled={busy || !deck.trim() || !lines.includes("|")}>
        Añadir tarjetas
      </Button>
    </form>
  );
}

/** 23 · Nuevo trabajo o entrega. */
export function AssignmentForm({ today, subjects }: { today: string; subjects: string[] }) {
  const router = useRouter();
  const [f, setF] = useState({ subject: subjects[0] ?? "", title: "", dueOn: today, weightPct: "" });
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api("/api/study/assignments", { body: { subject: f.subject, title: f.title, dueOn: f.dueOn, weightPct: f.weightPct ? Number(f.weightPct) : null } });
          toast.success("Trabajo añadido");
          setF({ ...f, title: "", weightPct: "" });
          router.refresh();
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Asignatura" htmlFor="as-subject">
        <Input id="as-subject" list="as-subjects" maxLength={60} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />
      </Field>
      <datalist id="as-subjects">
        {subjects.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <Field label="Trabajo" htmlFor="as-title">
        <Input id="as-title" maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Entrega" htmlFor="as-due">
          <Input id="as-due" type="date" className="w-full min-w-0" value={f.dueOn} onChange={(e) => setF({ ...f, dueOn: e.target.value })} />
        </Field>
        <Field label="Peso en la nota (%)" htmlFor="as-weight">
          <Input id="as-weight" inputMode="numeric" className="w-full min-w-0" value={f.weightPct} onChange={(e) => setF({ ...f, weightPct: e.target.value })} />
        </Field>
      </div>
      <Button type="submit" disabled={busy || !f.subject.trim() || !f.title.trim()}>
        Añadir trabajo
      </Button>
    </form>
  );
}

/** Estado y nota de un trabajo. */
export function AssignmentActions({ id, title, status, grade }: { id: string; title: string; status: AssignmentStatus; grade: number | null }) {
  const router = useRouter();
  const [g, setG] = useState(grade != null ? String(grade).replace(".", ",") : "");
  async function patch(body: unknown, ok?: string) {
    try {
      await api(`/api/study/assignments/${id}`, { method: "PATCH", body });
      if (ok) toast.success(ok);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }
  return (
    <div className="grid gap-2">
      <Chips label={`Estado de ${title}`} options={(Object.keys(ASSIGNMENT_STATUS) as AssignmentStatus[]).map((k) => ({ value: k, label: ASSIGNMENT_STATUS[k] }))} value={status} onChange={(v) => v && patch({ status: v })} />
      {status === "DONE" ? (
        <div className="flex items-center gap-2">
          <Input aria-label={`Nota de ${title}`} inputMode="decimal" className="w-20" value={g} onChange={(e) => setG(e.target.value)} />
          <Button type="button" size="sm" variant="outline" onClick={() => patch({ grade: g.trim() ? Number(g.replace(",", ".")) : null }, "Nota guardada")}>
            Guardar nota
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={async () => {
              if (!confirm(`¿Borrar «${title}»?`)) return;
              try {
                await api(`/api/study/assignments/${id}`, { method: "DELETE" });
                router.refresh();
              } catch (err) {
                toast.error((err as Error).message);
              }
            }}>
            Borrar
          </Button>
        </div>
      ) : null}
    </div>
  );
}
