"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Chips, Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/client-api";
import { APPOINTMENT_LABEL } from "@/lib/recovery/health-admin";

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

export function SupplementForm({ today }: { today: string }) {
  const { busy, call } = useCall();
  const [f, setF] = useState({ name: "", brand: "", batch: "", dose: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="grid gap-2 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Suplemento" htmlFor="sp-name">
          <Input id="sp-name" className="w-full min-w-0" value={f.name} maxLength={80} placeholder="Creatina" onChange={set("name")} />
        </Field>
        <Field label="Marca" htmlFor="sp-brand">
          <Input id="sp-brand" className="w-full min-w-0" value={f.brand} maxLength={80} onChange={set("brand")} />
        </Field>
        <Field label="Lote" htmlFor="sp-batch">
          <Input id="sp-batch" className="w-full min-w-0" value={f.batch} maxLength={60} onChange={set("batch")} />
        </Field>
        <Field label="Dosis que tomas" htmlFor="sp-dose">
          <Input id="sp-dose" className="w-full min-w-0" value={f.dose} maxLength={80} placeholder="la que te pautaron" onChange={set("dose")} />
        </Field>
      </div>
      <Button
        type="button"
        disabled={busy || !f.name.trim()}
        onClick={async () => {
          if (await call("/api/recovery/supplements", { body: { ...f, brand: f.brand || null, batch: f.batch || null, dose: f.dose || null, startedOn: today } }, "Suplemento añadido")) setF({ name: "", brand: "", batch: "", dose: "" });
        }}
      >
        Añadir suplemento
      </Button>
    </div>
  );
}

export function SupplementActions({ id, name, today, active }: { id: string; name: string; today: string; active: boolean }) {
  const { busy, call } = useCall();
  return (
    <span className="flex flex-wrap gap-2 text-xs">
      <button type="button" disabled={busy} className="underline underline-offset-2" onClick={() => call(`/api/recovery/supplements/${id}`, { method: "PATCH", body: { checkedOn: today } }, "Anotado: comprobado hoy")}>
        Comprobado hoy
      </button>
      {active ? (
        <button type="button" disabled={busy} className="underline underline-offset-2" onClick={() => call(`/api/recovery/supplements/${id}`, { method: "PATCH", body: { endedOn: today } }, `«${name}» terminado`)}>
          Lo dejo
        </button>
      ) : null}
      <button type="button" disabled={busy} className="text-destructive underline underline-offset-2" onClick={() => confirm(`¿Borrar «${name}»?`) && call(`/api/recovery/supplements/${id}`, { method: "DELETE" }, "Borrado")}>
        Borrar
      </button>
    </span>
  );
}

export function AppointmentForm({ today }: { today: string }) {
  const { busy, call } = useCall();
  const [kind, setKind] = useState<"PHYSIO" | "DOCTOR" | "OTHER">("PHYSIO");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("17:00");
  const [place, setPlace] = useState("");
  const [notes, setNotes] = useState("");
  async function save() {
    // Hora local del móvil → ISO con su desfase
    const at = new Date(`${date}T${time}:00`).toISOString();
    if (await call("/api/recovery/appointments", { body: { kind, at, place: place || null, notes: notes || null } }, "Cita guardada")) {
      setPlace("");
      setNotes("");
    }
  }
  return (
    <div className="grid gap-2 text-sm">
      <Chips label="Tipo de cita" value={kind} onChange={(v) => v && setKind(v)} options={Object.entries(APPOINTMENT_LABEL).map(([value, label]) => ({ value: value as typeof kind, label }))} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Día" htmlFor="ap-date">
          <Input id="ap-date" type="date" className="w-full min-w-0" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Hora" htmlFor="ap-time">
          <Input id="ap-time" type="time" className="w-full min-w-0" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      <Field label="Dónde" htmlFor="ap-place">
        <Input id="ap-place" value={place} maxLength={120} onChange={(e) => setPlace(e.target.value)} />
      </Field>
      <Field label="Qué quieres preguntar" htmlFor="ap-notes">
        <Textarea id="ap-notes" rows={2} value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Button type="button" disabled={busy} onClick={save}>
        Guardar cita
      </Button>
    </div>
  );
}

export function DeleteAppointment({ id }: { id: string }) {
  const { busy, call } = useCall();
  return (
    <button type="button" disabled={busy} aria-label="Borrar cita" className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => call(`/api/recovery/appointments/${id}`, { method: "DELETE" }, "Cita borrada")}>
      borrar
    </button>
  );
}
