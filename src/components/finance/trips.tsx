"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/client-api";
import { formatEur } from "@/lib/format";
import { DEADLINE_KIND, TRIP_PARTS, type TripPart } from "@/lib/finance/trips";
import { cn } from "@/lib/utils";

const toCents = (s: string) => Math.max(0, Math.round((Number(s.replace(",", ".")) || 0) * 100));

function useCall() {
  const router = useRouter();
  return async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) toast.success(ok);
      router.refresh();
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    }
  };
}

/** Nuevo viaje: competición, fechas, presupuesto por partidas (€) y lo que reembolsa la federación. */
export function TripForm({ competitions, today }: { competitions: Array<{ id: string; title: string; date: string }>; today: string }) {
  const call = useCall();
  const empty = { name: "", eventId: "", startsOn: today, endsOn: "", reimb: "", ...Object.fromEntries(Object.keys(TRIP_PARTS).map((k) => [k, ""])) } as Record<string, string>;
  const [f, setF] = useState(empty);
  const set = (k: string, v: string) => setF({ ...f, [k]: v });
  return (
    <form
      className="grid gap-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await call(
          () =>
            api("/api/finance/trips", {
              body: {
                name: f.name,
                eventId: f.eventId || null,
                startsOn: f.startsOn,
                endsOn: f.endsOn || null,
                budget: Object.fromEntries(Object.keys(TRIP_PARTS).map((k) => [k, toCents(f[k])])),
                reimbursableCents: toCents(f.reimb),
              },
            }),
          "Viaje creado",
        );
        if (ok) setF(empty);
      }}
    >
      <Field label="Viaje" htmlFor="tr-name">
        <Input id="tr-name" value={f.name} maxLength={80} placeholder="Campeonato en León" onChange={(e) => set("name", e.target.value)} />
      </Field>
      <Field label="Competición" htmlFor="tr-ev">
        <Select
          id="tr-ev"
          value={f.eventId}
          onChange={(e) => {
            const c = competitions.find((x) => x.id === e.target.value);
            setF({ ...f, eventId: e.target.value, ...(c ? { startsOn: c.date, name: f.name || c.title } : {}) });
          }}
        >
          <option value="">Sin competición</option>
          {competitions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.date} · {c.title}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Ida" htmlFor="tr-from">
          <Input id="tr-from" type="date" className="w-full min-w-0" value={f.startsOn} onChange={(e) => set("startsOn", e.target.value)} />
        </Field>
        <Field label="Vuelta" htmlFor="tr-to">
          <Input id="tr-to" type="date" className="w-full min-w-0" value={f.endsOn} onChange={(e) => set("endsOn", e.target.value)} />
        </Field>
      </div>
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="mb-1 font-medium">Presupuesto (€)</legend>
        {(Object.entries(TRIP_PARTS) as Array<[TripPart, string]>).map(([k, label]) => (
          <Input key={k} aria-label={`Presupuesto de ${label.toLowerCase()}`} inputMode="decimal" className="w-full min-w-0" placeholder={label} value={f[k]} onChange={(e) => set(k, e.target.value)} />
        ))}
        <Input aria-label="Reembolso de la federación" inputMode="decimal" className="w-full min-w-0" placeholder="Reembolso fed." value={f.reimb} onChange={(e) => set("reimb", e.target.value)} />
      </fieldset>
      <Button type="submit" disabled={!f.name.trim()}>
        Crear viaje
      </Button>
    </form>
  );
}

type Trip = {
  id: string;
  name: string;
  eventTitle: string | null;
  startsOn: string;
  endsOn: string | null;
  reimbursableCents: number;
  reimbursedAt: string | null;
  budget: Record<TripPart, number>;
  budgetCents: number;
  spentCents: number;
  leftCents: number;
  over: boolean;
  pendingCents: number;
  netCents: number;
  expenses: Array<{ id: string; date: string; description: string; amountCents: number }>;
};

/** Un viaje: presupuesto por partidas, gastos enlazados (y enlazar más) y reembolso. */
export function TripCard({ trip: t, unlinked }: { trip: Trip; unlinked: Array<{ id: string; date: string; description: string; amountCents: number }> }) {
  const call = useCall();
  const [pick, setPick] = useState("");
  const patch = (body: unknown, ok?: string) => call(() => api(`/api/finance/trips/${t.id}`, { method: "PATCH", body }), ok);
  return (
    <div className="grid gap-2 text-sm" aria-label={`Viaje ${t.name}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{t.name}</p>
          <p className="text-xs text-muted-foreground">
            {t.startsOn}
            {t.endsOn && t.endsOn !== t.startsOn ? ` → ${t.endsOn}` : ""}
            {t.eventTitle ? ` · ${t.eventTitle}` : ""}
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 text-xs text-destructive underline-offset-2 hover:underline"
          onClick={() => confirm(`¿Borrar el viaje «${t.name}»? Los gastos se quedan.`) && call(() => api(`/api/finance/trips/${t.id}`, { method: "DELETE" }), "Viaje borrado")}
        >
          Borrar
        </button>
      </div>
      <p className={cn("rounded-md p-2 tabular-nums", t.over ? "bg-destructive/10 text-destructive" : "bg-muted")} aria-label="Gastado frente a presupuesto">
        Gastado {formatEur(t.spentCents)} de {formatEur(t.budgetCents)}
        {t.budgetCents ? ` · ${t.over ? "te pasas" : "quedan"} ${formatEur(Math.abs(t.leftCents))}` : ""}
        {t.reimbursableCents ? ` · te cuesta ${formatEur(t.netCents)} tras el reembolso` : ""}
      </p>
      {t.budgetCents ? (
        <ul className="grid grid-cols-2 gap-x-3 text-xs text-muted-foreground">
          {(Object.entries(TRIP_PARTS) as Array<[TripPart, string]>)
            .filter(([k]) => t.budget[k])
            .map(([k, label]) => (
              <li key={k} className="flex justify-between">
                <span>{label}</span>
                <span className="tabular-nums">{formatEur(t.budget[k])}</span>
              </li>
            ))}
        </ul>
      ) : null}
      {t.expenses.length ? (
        <ul className="grid gap-1 text-xs">
          {t.expenses.map((x) => (
            <li key={x.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">
                {x.date} · {x.description}
              </span>
              <span className="shrink-0 tabular-nums">{formatEur(x.amountCents)}</span>
              <button type="button" aria-label={`Soltar ${x.description}`} className="shrink-0 px-1 text-muted-foreground" onClick={() => patch({ unlink: x.id })}>
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {unlinked.length ? (
        <div className="flex gap-2">
          <Select aria-label={`Gasto para ${t.name}`} className="min-w-0 flex-1" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Enlazar un gasto…</option>
            {unlinked.map((x) => (
              <option key={x.id} value={x.id}>
                {x.date} · {x.description} · {formatEur(x.amountCents)}
              </option>
            ))}
          </Select>
          <Button type="button" variant="outline" disabled={!pick} onClick={async () => (await patch({ link: pick }, "Gasto enlazado")) && setPick("")}>
            Enlazar
          </Button>
        </div>
      ) : null}
      {t.reimbursableCents ? (
        <label className="flex items-center gap-2">
          <input type="checkbox" className="size-4" checked={Boolean(t.reimbursedAt)} onChange={(e) => patch({ reimbursed: e.target.checked }, e.target.checked ? "Reembolso cobrado" : "Reembolso pendiente")} />
          {t.reimbursedAt ? `Reembolso de ${formatEur(t.reimbursableCents)} cobrado` : `La federación te debe ${formatEur(t.pendingCents)}`}
        </label>
      ) : null}
    </div>
  );
}

type Deadline = { id: string; title: string; kind: string; dueOn: string; remindDays: number; done: boolean; daysLeft: number; overdue: boolean };

/** Plazos con aviso push N días antes. */
export function DeadlinesPanel({ deadlines, today }: { deadlines: Deadline[]; today: string }) {
  const call = useCall();
  const [f, setF] = useState({ title: "", kind: "ENTRY", dueOn: today, remindDays: "3" });
  return (
    <div className="grid gap-3 text-sm">
      {deadlines.length ? (
        <ul className="grid gap-1" aria-label="Plazos">
          {deadlines.map((d) => (
            <li key={d.id} className={cn("flex items-center gap-2 rounded-md border px-2 py-1.5", d.done && "text-muted-foreground line-through", d.overdue && "border-destructive/50")}>
              <input
                type="checkbox"
                className="size-4"
                aria-label={`Hecho: ${d.title}`}
                checked={d.done}
                onChange={(e) => call(() => api(`/api/finance/deadlines/${d.id}`, { method: "PATCH", body: { done: e.target.checked } }))}
              />
              <span className="min-w-0 flex-1 truncate">
                {d.title} <span className="text-xs text-muted-foreground">· {DEADLINE_KIND[d.kind as keyof typeof DEADLINE_KIND] ?? d.kind}</span>
              </span>
              <span className={cn("shrink-0 text-xs tabular-nums", d.overdue ? "text-destructive" : "text-muted-foreground")}>
                {d.done ? d.dueOn : d.overdue ? `venció hace ${-d.daysLeft} d` : d.daysLeft === 0 ? "hoy" : `en ${d.daysLeft} d`}
              </span>
              <button type="button" aria-label={`Borrar ${d.title}`} className="shrink-0 px-1 text-destructive" onClick={() => call(() => api(`/api/finance/deadlines/${d.id}`, { method: "DELETE" }))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        className="grid grid-cols-2 gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await call(() => api("/api/finance/deadlines", { body: { ...f, remindDays: Number(f.remindDays) || 0 } }), "Plazo añadido")) setF({ ...f, title: "" });
        }}
      >
        <Input aria-label="Plazo" className="col-span-2 w-full min-w-0" placeholder="Inscripción al autonómico" maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <Select aria-label="Tipo de plazo" className="w-full min-w-0" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
          {Object.entries(DEADLINE_KIND).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </Select>
        <Input aria-label="Fecha límite" type="date" className="w-full min-w-0" value={f.dueOn} onChange={(e) => setF({ ...f, dueOn: e.target.value })} />
        <label className="col-span-2 flex items-center gap-2 text-xs text-muted-foreground">
          Avisarme
          <Input aria-label="Días de aviso" inputMode="numeric" className="h-8 w-14" value={f.remindDays} onChange={(e) => setF({ ...f, remindDays: e.target.value })} />
          días antes (notificación push)
        </label>
        <Button type="submit" variant="outline" className="col-span-2" disabled={!f.title.trim()}>
          Añadir plazo
        </Button>
      </form>
    </div>
  );
}
