"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Chips, Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";

const hhmm = (iso: string) => new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(iso));

function useCall() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return {
    busy,
    async call(url: string, init: { method?: string; body?: unknown }, ok: string) {
      setBusy(true);
      try {
        await api(url, init);
        toast.success(ok);
        router.refresh();
        return true;
      } catch (e) {
        toast.error((e as Error).message);
        return false;
      } finally {
        setBusy(false);
      }
    },
  };
}

const DURATIONS = [
  { value: 30, label: "30 min" },
  { value: 60, label: "1 h" },
  { value: 90, label: "1,5 h" },
  { value: 120, label: "2 h" },
  { value: 180, label: "3 h" },
];

/** «Salgo» con hora de vuelta (y ubicación si quieres) · «Llegué». */
export function TripCard({ trip, hasContacts }: { trip: { startedAt: string; dueAt: string; alerted: boolean } | null; hasContacts: boolean }) {
  const { busy, call } = useCall();
  const [minutes, setMinutes] = useState(90);
  const [note, setNote] = useState("");
  const [shareLoc, setShareLoc] = useState(false);

  async function start() {
    let pos: { lat?: number; lon?: number } = {};
    if (shareLoc && "geolocation" in navigator) {
      pos = await new Promise((resolve) =>
        navigator.geolocation.getCurrentPosition(
          (p) => resolve({ lat: Math.round(p.coords.latitude * 1e5) / 1e5, lon: Math.round(p.coords.longitude * 1e5) / 1e5 }),
          () => {
            toast.error("No se pudo leer la ubicación: sales sin ella");
            resolve({});
          },
          { timeout: 8000 },
        ),
      );
    }
    await call("/api/safety/trip", { body: { minutes, note: note || undefined, ...pos } }, "Salida anotada");
  }

  if (trip) {
    return (
      <div role="status" className="grid gap-3 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
        <p>
          Saliste a las <span className="font-semibold tabular-nums">{hhmm(trip.startedAt)}</span> · vuelta prevista a las{" "}
          <span className="font-semibold tabular-nums">{hhmm(trip.dueAt)}</span>
          {trip.alerted ? <span className="block font-medium text-destructive">Ya se ha avisado a tus contactos.</span> : null}
        </p>
        <Button type="button" size="lg" disabled={busy} onClick={() => call("/api/safety/trip", { method: "DELETE" }, "Llegada anotada")}>
          Llegué
        </Button>
      </div>
    );
  }
  return (
    <div className="grid gap-3 text-sm">
      {!hasContacts ? <p className="rounded-md border border-dashed p-2 text-muted-foreground">Aún no tienes contactos que hayan aceptado: nadie recibiría el aviso.</p> : null}
      <Field label="Vuelvo en">
        <Chips label="Tiempo hasta la vuelta" value={minutes} onChange={(v) => v && setMinutes(v)} options={DURATIONS} />
      </Field>
      <Field label="Dónde (opcional)" htmlFor="s-note">
        <Input id="s-note" value={note} maxLength={200} placeholder="Pista de atletismo" onChange={(e) => setNote(e.target.value)} />
      </Field>
      <label className="flex items-center gap-2">
        <input type="checkbox" className="size-4" checked={shareLoc} onChange={(e) => setShareLoc(e.target.checked)} />
        Compartir mi ubicación al salir (solo se envía si salta el aviso)
      </label>
      <Button type="button" size="lg" disabled={busy} onClick={start}>
        Salgo
      </Button>
    </div>
  );
}

type ContactLink = { id: string; status: string; name: string };

export function ContactsCard({ contacts, watching }: { contacts: ContactLink[]; watching: ContactLink[] }) {
  const { busy, call } = useCall();
  const [email, setEmail] = useState("");
  return (
    <div className="grid gap-4 text-sm">
      <div className="grid gap-2">
        <p className="font-medium">Mis contactos de confianza</p>
        {contacts.length ? (
          <ul className="grid gap-1" aria-label="Mis contactos">
            {contacts.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2">
                <span>
                  {c.name} <span className="text-xs text-muted-foreground">· {c.status === "ACTIVE" ? "aceptado" : "pendiente de aceptar"}</span>
                </span>
                <button type="button" className="text-xs text-destructive underline-offset-2 hover:underline" onClick={() => call(`/api/safety/contacts/${c.id}`, { method: "PATCH", body: { status: "REVOKED" } }, "Contacto quitado")}>
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">Ninguno todavía.</p>
        )}
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (email.trim() && (await call("/api/safety/contacts", { body: { email } }, "Invitación enviada"))) setEmail("");
          }}
        >
          <Input type="email" aria-label="Email de tu contacto" placeholder="email de su cuenta de Atlenza" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" variant="outline" disabled={busy}>
            Invitar
          </Button>
        </form>
      </div>
      {watching.length ? (
        <div className="grid gap-2 border-t pt-3">
          <p className="font-medium">Me tienen de contacto</p>
          <ul className="grid gap-1" aria-label="Me tienen de contacto">
            {watching.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>{w.name}</span>
                {w.status === "PENDING" ? (
                  <span className="flex gap-2">
                    <Button type="button" size="sm" disabled={busy} onClick={() => call(`/api/safety/contacts/${w.id}`, { method: "PATCH", body: { status: "ACTIVE" } }, "Aceptado")}>
                      Aceptar
                    </Button>
                    <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => call(`/api/safety/contacts/${w.id}`, { method: "PATCH", body: { status: "REVOKED" } }, "Rechazado")}>
                      Rechazar
                    </Button>
                  </span>
                ) : (
                  <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => call(`/api/safety/contacts/${w.id}`, { method: "PATCH", body: { status: "REVOKED" } }, "Ya no eres su contacto")}>
                    Dejar de ser contacto
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
