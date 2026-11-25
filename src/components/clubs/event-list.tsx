"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";
import { RSVP_ANSWERS, RSVP_LABEL, type Rsvp } from "@/lib/clubs/events";
import { formatAmount } from "@/lib/clubs/fees";
import { formatDateTime } from "@/lib/format";

export interface EventRow {
  id: string;
  title: string;
  startsAt: string;
  location: string | null;
  feeCents: number | null;
  past: boolean;
  myAnswer: Rsvp | null;
  myFee: { status: "PENDING" | "PAID"; paidAt: string | null } | null;
  summary: { yes: number; no: number; maybe: number; none: number; names: Record<Rsvp | "NONE", string[]> } | null;
}

/** Lista de eventos del club: responder en 1 toque (sí/no/quizá). El staff ve además el resumen con nombres. */
export function EventList({ orgId, events, canDelete }: { orgId: string; events: EventRow[]; canDelete: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  // Respuesta mostrada al instante; el servidor manda al refrescar
  const [local, setLocal] = useState<Record<string, Rsvp>>({});

  async function answer(e: EventRow, a: Rsvp) {
    setBusy(e.id);
    setLocal((l) => ({ ...l, [e.id]: a }));
    try {
      await api(`/api/clubs/${orgId}/events/${e.id}/response`, { method: "PUT", body: { answer: a } });
      router.refresh();
    } catch (err) {
      setLocal((l) => Object.fromEntries(Object.entries(l).filter(([k]) => k !== e.id)));
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!events.length) return <p className="text-sm text-muted-foreground">Sin eventos próximos.</p>;
  return (
    <ul className="grid gap-2">
      {events.map((e) => {
        const mine = local[e.id] ?? e.myAnswer;
        return (
          <li key={e.id} data-testid={`event-${e.id}`} className="grid gap-2 rounded-md border p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">{e.title}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(e.startsAt, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  {e.location ? ` · ${e.location}` : ""}
                  {e.past ? " · ya pasó" : ""}
                </p>
                {e.feeCents ? (
                  <p className="text-xs text-muted-foreground" data-testid={`event-fee-${e.id}`}>
                    Cuota {formatAmount(e.feeCents)}
                    {e.myFee ? ` · ${e.myFee.status === "PAID" ? "pagada" : "pendiente"}` : " · se apunta si dices que sí"}
                  </p>
                ) : null}
              </div>
              {canDelete ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="max-md:min-h-11"
                  aria-label={`Borrar el evento ${e.title}`}
                  onClick={async () => {
                    if (!(await confirmDialog({ title: "¿Borrar el evento?", description: "Se borran las respuestas y las cuotas aún pendientes de este evento.", confirmLabel: "Borrar", destructive: true }))) return;
                    try {
                      await api(`/api/clubs/${orgId}/events/${e.id}`, { method: "DELETE" });
                      router.refresh();
                    } catch (err) {
                      toast.error((err as Error).message);
                    }
                  }}
                >
                  Borrar
                </Button>
              ) : null}
            </div>
            <div role="group" aria-label={`Tu respuesta a ${e.title}`} data-testid={`rsvp-${e.id}`} className="grid grid-cols-3 gap-2">
              {RSVP_ANSWERS.map((a) => (
                <button
                  key={a}
                  type="button"
                  aria-pressed={mine === a}
                  disabled={e.past || busy === e.id}
                  onClick={() => answer(e, a)}
                  className="min-h-11 rounded-md border px-3 text-sm font-medium aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground disabled:opacity-60"
                >
                  {RSVP_LABEL[a]}
                </button>
              ))}
            </div>
            {e.summary ? (
              <details>
                <summary className="flex min-h-11 cursor-pointer items-center text-xs text-muted-foreground" data-testid={`summary-${e.id}`}>
                  Sí {e.summary.yes} · No {e.summary.no} · Quizá {e.summary.maybe} · Sin respuesta {e.summary.none}
                </summary>
                <dl className="grid gap-1 text-xs">
                  {(["YES", "NO", "MAYBE", "NONE"] as const).map((k) => (
                    <div key={k} className="flex gap-2">
                      <dt className="w-24 shrink-0 text-muted-foreground">{k === "NONE" ? "Sin respuesta" : RSVP_LABEL[k]}</dt>
                      <dd className="min-w-0">{e.summary!.names[k].join(", ") || "—"}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function EventForm({ orgId, canFee }: { orgId: string; canFee: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [location, setLocation] = useState("");
  const [amount, setAmount] = useState("");
  return (
    <form
      className="grid gap-2 sm:grid-cols-2"
      onSubmit={async (ev) => {
        ev.preventDefault();
        setBusy(true);
        try {
          await api(`/api/clubs/${orgId}/events`, { body: { title, startsAt, location: location || undefined, amount: amount || undefined } });
          toast.success("Evento creado");
          setTitle("");
          setStartsAt("");
          setLocation("");
          setAmount("");
          router.refresh();
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="grid gap-1 text-xs text-muted-foreground">
        Título
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Entreno conjunto" required maxLength={80} />
      </label>
      <label className="grid gap-1 text-xs text-muted-foreground">
        Fecha y hora (Madrid)
        <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
      </label>
      <label className="grid gap-1 text-xs text-muted-foreground">
        Lugar (opcional)
        <Input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120} />
      </label>
      {canFee ? (
        <label className="grid gap-1 text-xs text-muted-foreground">
          Cuota por asistente en € (opcional; solo apunte, no se cobra)
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="10,00" />
        </label>
      ) : null}
      <Button type="submit" disabled={busy} className="sm:col-span-2">Crear evento</Button>
    </form>
  );
}
