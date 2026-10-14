"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/client-api";
import { parsePhasesText } from "@/lib/recovery/physio-protocol";

const HELP = "# Nombre de fase | dolor máx 2 | objetivo\n- Ejercicio: dosis\n? Criterio para pasar de fase";

/** Alta y edición de un protocolo con el editor de texto de fases. */
export function ProtocolEditor({ id, initial }: { id?: string; initial?: { title: string; notes: string; text: string } }) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [text, setText] = useState(initial?.text ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const body = { title, notes: notes || null, phases: parsePhasesText(text) };
          if (id) {
            await api(`/api/recovery/physio/${id}`, { method: "PATCH", body });
            toast.success("Protocolo guardado");
            router.refresh();
          } else {
            const r = await api<{ id: string }>("/api/recovery/physio", { body });
            router.push(`/recovery/fisio/${r.id}`);
          }
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="pp-title">Título</Label>
        <Input id="pp-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="pp-notes">Notas generales (opcional)</Label>
        <Textarea id="pp-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={2} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="pp-phases">Fases, ejercicios y criterios</Label>
        <Textarea id="pp-phases" value={text} onChange={(e) => setText(e.target.value)} rows={10} placeholder={HELP} className="font-mono text-xs" required />
        <p className="whitespace-pre-line text-xs text-muted-foreground">{HELP}</p>
      </div>
      <Button type="submit" disabled={busy}>{id ? "Guardar cambios" : "Crear protocolo"}</Button>
    </form>
  );
}

export interface ShareRow {
  shareId: string;
  athleteId: string;
  athlete: string;
  blocked: boolean;
  done?: number;
  total?: number;
  pct?: number;
  phase?: number;
  painToday?: number | null;
}

export function SharePanel({ id, athletes, shares, phaseNames }: { id: string; athletes: Array<{ id: string; name: string }>; shares: ShareRow[]; phaseNames: string[] }) {
  const router = useRouter();
  const sharedIds = new Set(shares.map((s) => s.athleteId));
  const options = athletes.filter((a) => !sharedIds.has(a.id));
  const [athleteId, setAthleteId] = useState("");
  const call = async (method: "POST" | "DELETE", who: string) => {
    try {
      await api(`/api/recovery/physio/${id}/shares`, { method, body: { athleteId: who } });
      toast.success(method === "POST" ? "Protocolo compartido" : "Acceso retirado");
      setAthleteId("");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <div className="grid gap-3">
      {options.length ? (
        <div className="flex gap-2">
          <label htmlFor="share-athlete" className="sr-only">Atleta</label>
          <select id="share-athlete" value={athleteId} onChange={(e) => setAthleteId(e.target.value)} className="min-h-11 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm">
            <option value="">Elige atleta…</option>
            {options.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <Button type="button" disabled={!athleteId} onClick={() => call("POST", athleteId)} className="min-h-11">Compartir</Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No hay más atletas con ámbito «recuperación» activo.</p>
      )}
      <ul className="grid gap-2" aria-label="Compartido con">
        {shares.map((s) => (
          <li key={s.shareId} className="rounded-lg border p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{s.athlete}</span>
              <Button type="button" size="sm" variant="outline" onClick={() => call("DELETE", s.athleteId)}>Quitar</Button>
            </div>
            {s.blocked ? (
              <p className="mt-1 text-muted-foreground">Sin acceso: la atleta ha limitado el tratamiento o retiró el permiso.</p>
            ) : (
              <p className="mt-1 text-muted-foreground">
                Fase: {phaseNames[s.phase ?? 0]} · {s.done}/{s.total} criterios ({s.pct} %){s.painToday != null ? ` · dolor hoy ${s.painToday}/10` : ""}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DeleteProtocol({ id }: { id: string }) {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        if (!confirm("¿Borrar el protocolo? Se retira también a las atletas con las que lo compartiste.")) return;
        try {
          await api(`/api/recovery/physio/${id}`, { method: "DELETE" });
          router.push("/recovery/fisio");
        } catch (e) {
          toast.error((e as Error).message);
        }
      }}
    >
      Borrar protocolo
    </Button>
  );
}
