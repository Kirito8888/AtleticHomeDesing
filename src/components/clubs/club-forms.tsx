"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";

/** Envuelve una llamada: avisa del error, refresca la página al terminar bien. */
function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return {
    busy,
    run: async (fn: () => Promise<unknown>, ok?: string) => {
      setBusy(true);
      try {
        await fn();
        if (ok) toast.success(ok);
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

export function CreateClub() {
  const { busy, run } = useAction();
  const [name, setName] = useState("");
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run(() => api("/api/clubs", { body: { name } }), "Club creado")) setName("");
      }}
    >
      <label className="sr-only" htmlFor="club-name">Nombre del club</label>
      <Input id="club-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del club" required minLength={2} maxLength={80} />
      <Button type="submit" disabled={busy}>Crear club</Button>
    </form>
  );
}

const SCOPES = [
  ["LOAD", "Carga y marcas"],
  ["SESSIONS", "Sesiones"],
  ["RECOVERY", "Recuperación y lesiones"],
  ["PLANNING", "Planificación"],
  ["REPORTS", "Informes del coach IA"],
] as const;

/** Invitación pendiente: la persona acepta y, si es atleta, elige qué ve el staff del club. */
export function AcceptInvite({ orgId, memberId, orgName, role }: { orgId: string; memberId: string; orgName: string; role: string }) {
  const { busy, run } = useAction();
  const [scopes, setScopes] = useState<string[]>(SCOPES.map(([k]) => k));
  const [canPlan, setCanPlan] = useState(false);
  const isAthlete = role === "ATHLETE";
  const url = `/api/clubs/${orgId}/members/${memberId}`;
  return (
    <div className="grid gap-2 rounded-md border p-3 text-sm">
      <p>
        <strong>{orgName}</strong> te invita como {isAthlete ? "atleta" : role === "ADMIN" ? "administradora" : "entrenadora"}.
      </p>
      {isAthlete ? (
        <fieldset className="grid gap-1">
          <legend className="mb-1 text-xs text-muted-foreground">El staff del club podrá ver:</legend>
          {SCOPES.map(([k, label]) => (
            <label key={k} className="flex min-h-11 items-center gap-2">
              <input type="checkbox" className="size-4" checked={scopes.includes(k)} onChange={(e) => setScopes(e.target.checked ? [...scopes, k] : scopes.filter((s) => s !== k))} />
              {label}
            </label>
          ))}
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" className="size-4" checked={canPlan} onChange={(e) => setCanPlan(e.target.checked)} />
            Puede planificarme sesiones
          </label>
        </fieldset>
      ) : null}
      <div className="flex gap-2">
        <Button disabled={busy} onClick={() => run(() => api(url, { method: "PATCH", body: { status: "ACTIVE", ...(isAthlete ? { scopes, canPlan } : {}) } }), "Te has unido")}>Aceptar</Button>
        <Button variant="outline" disabled={busy} onClick={() => run(() => api(url, { method: "DELETE" }), "Invitación rechazada")}>Rechazar</Button>
      </div>
    </div>
  );
}

export function InviteMember({ orgId }: { orgId: string }) {
  const { busy, run } = useAction();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("ATHLETE");
  return (
    <form
      className="grid gap-2 sm:grid-cols-[1fr_auto_auto]"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run(() => api(`/api/clubs/${orgId}/members`, { body: { email, role } }), "Invitación enviada")) setEmail("");
      }}
    >
      <label className="sr-only" htmlFor="invite-email">Email de la persona</label>
      <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@ejemplo.com" required />
      <label className="sr-only" htmlFor="invite-role">Rol</label>
      <select id="invite-role" value={role} onChange={(e) => setRole(e.target.value)} className="min-h-11 rounded-md border border-input bg-transparent px-2 text-base md:min-h-9 md:text-sm">
        <option value="ATHLETE">Atleta</option>
        <option value="COACH">Entrenadora</option>
        <option value="ADMIN">Administradora</option>
      </select>
      <Button type="submit" disabled={busy}>Invitar</Button>
    </form>
  );
}

export function RemoveMember({ orgId, memberId, label }: { orgId: string; memberId: string; label: string }) {
  const { busy, run } = useAction();
  return (
    <Button variant="ghost" size="sm" className="max-md:min-h-11" disabled={busy} aria-label={label} onClick={() => confirm("¿Seguro?") && run(() => api(`/api/clubs/${orgId}/members/${memberId}`, { method: "DELETE" }))}>
      Quitar
    </Button>
  );
}

export function FeeForm({ orgId, athletes, defaultDue }: { orgId: string; athletes: Array<{ memberId: string; name: string }>; defaultDue: string }) {
  const { busy, run } = useAction();
  const [memberId, setMemberId] = useState(athletes[0]?.memberId ?? "");
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(defaultDue);
  if (!athletes.length) return <p className="text-sm text-muted-foreground">Añade atletas al club para apuntar cuotas.</p>;
  return (
    <form
      className="grid gap-2 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run(() => api(`/api/clubs/${orgId}/fees`, { body: { memberId, concept, amount, dueDate } }), "Cuota apuntada")) {
          setConcept("");
          setAmount("");
        }
      }}
    >
      <label className="grid gap-1 text-xs text-muted-foreground">
        Atleta
        <select aria-label="Atleta de la cuota" value={memberId} onChange={(e) => setMemberId(e.target.value)} className="min-h-11 rounded-md border border-input bg-transparent px-2 text-base text-foreground md:min-h-9 md:text-sm">
          {athletes.map((a) => (
            <option key={a.memberId} value={a.memberId}>{a.name}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs text-muted-foreground">
        Concepto
        <Input value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Cuota octubre" required maxLength={80} />
      </label>
      <label className="grid gap-1 text-xs text-muted-foreground">
        Importe (€)
        <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="30,00" required />
      </label>
      <label className="grid gap-1 text-xs text-muted-foreground">
        Vencimiento
        <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
      </label>
      <Button type="submit" disabled={busy} className="sm:col-span-2">Apuntar cuota</Button>
    </form>
  );
}

export function FeeToggle({ orgId, feeId, paid, label }: { orgId: string; feeId: string; paid: boolean; label: string }) {
  const { busy, run } = useAction();
  return (
    <Button variant="outline" size="sm" className="max-md:min-h-11" disabled={busy} aria-label={label} onClick={() => run(() => api(`/api/clubs/${orgId}/fees/${feeId}`, { method: "PATCH", body: { status: paid ? "PENDING" : "PAID" } }))}>
      {paid ? "Marcar pendiente" : "Marcar pagada"}
    </Button>
  );
}
