"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/client-api";

const ROLE_LABEL = { ATHLETE: "Atleta", COACH: "Entrenador/a", ADMIN: "Administración" } as const;
const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso)) : "—");

/** Enlace que solo se ve una vez: se copia y se entrega por el canal que elija la administración. */
function OneTimeLink({ url, label, onClose }: { url: string; label: string; onClose: () => void }) {
  return (
    <div role="status" className="grid gap-2 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
      <p className="font-medium">{label}</p>
      <Input readOnly value={url} aria-label="Enlace" onFocus={(e) => e.target.select()} />
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              toast.success("Enlace copiado");
            } catch {
              toast.error("Cópialo a mano");
            }
          }}
        >
          Copiar
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Cerrar
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Solo se muestra ahora. Envíalo por un canal privado; quien lo tenga puede usarlo.</p>
    </div>
  );
}

export function InviteForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"ATHLETE" | "COACH">("ATHLETE");
  const [days, setDays] = useState(7);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  return (
    <div className="grid gap-3 text-sm">
      {link ? <OneTimeLink url={link} label="Invitación creada" onClose={() => setLink(null)} /> : null}
      <form
        className="grid gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const r = await api<{ url: string }>("/api/admin/invitations", { body: { email: email.trim() || null, role, days, note: note.trim() || null } });
            setLink(r.url);
            setEmail("");
            setNote("");
            router.refresh();
          } catch (err) {
            toast.error((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Email (opcional)" htmlFor="inv-email" hint="Si lo pones, la invitación solo vale para ese email">
          <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Rol" htmlFor="inv-role">
            <Select id="inv-role" value={role} onChange={(e) => setRole(e.target.value as "ATHLETE" | "COACH")}>
              <option value="ATHLETE">Atleta</option>
              <option value="COACH">Entrenador/a</option>
            </Select>
          </Field>
          <Field label="Caduca en" htmlFor="inv-days">
            <Select id="inv-days" value={String(days)} onChange={(e) => setDays(Number(e.target.value))}>
              {[1, 3, 7, 14, 30].map((d) => (
                <option key={d} value={d}>
                  {d} {d === 1 ? "día" : "días"}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Nota (opcional)" htmlFor="inv-note">
          <Input id="inv-note" maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} placeholder="p. ej. compañera del club" />
        </Field>
        <Button type="submit" disabled={busy} className="justify-self-start">
          Crear invitación
        </Button>
      </form>
    </div>
  );
}

export function PendingInvitations({ items }: { items: Array<{ id: string; email: string | null; role: keyof typeof ROLE_LABEL; note: string | null; expiresAt: string }> }) {
  const router = useRouter();
  if (!items.length) return <p className="text-sm text-muted-foreground">No hay invitaciones pendientes.</p>;
  return (
    <ul className="grid gap-2 text-sm" aria-label="Invitaciones pendientes">
      {items.map((i) => (
        <li key={i.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
          <span className="min-w-0">
            <span className="block truncate">{i.email ?? "Cualquier email"}</span>
            <span className="text-xs text-muted-foreground">
              {ROLE_LABEL[i.role]} · caduca el {when(i.expiresAt)}
              {i.note ? ` · ${i.note}` : ""}
            </span>
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={async () => {
              try {
                await api(`/api/admin/invitations/${i.id}`, { method: "DELETE" });
                toast.success("Invitación revocada");
                router.refresh();
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            Revocar
          </Button>
        </li>
      ))}
    </ul>
  );
}

export type AdminUserRow = {
  id: string;
  name: string | null;
  email: string;
  role: keyof typeof ROLE_LABEL;
  createdAt: string;
  lastLoginAt: string | null;
  suspendedAt: string | null;
  locked: boolean;
  secondFactor: boolean;
  demo: boolean;
  me: boolean;
};

export function UserList({ users }: { users: AdminUserRow[] }) {
  const router = useRouter();
  const [link, setLink] = useState<{ url: string; who: string } | null>(null);
  async function act(id: string, action: "suspend" | "reactivate" | "reset-password", who: string) {
    try {
      const r = await api<{ ok?: boolean; url?: string }>(`/api/admin/users/${id}`, { body: { action } });
      if (r.url) setLink({ url: r.url, who });
      else toast.success(action === "suspend" ? "Cuenta suspendida" : "Cuenta reactivada");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <div className="grid gap-3">
      {link ? <OneTimeLink url={link.url} label={`Enlace para que ${link.who} ponga una contraseña nueva (1 hora, un solo uso)`} onClose={() => setLink(null)} /> : null}
      <ul className="grid gap-2 text-sm" aria-label="Cuentas">
        {users.map((u) => (
          <li key={u.id} className="grid gap-1 rounded-md border p-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="min-w-0 truncate font-medium">
                {u.name ?? u.email}
                {u.me ? " (tú)" : ""}
              </span>
              <span className="text-xs text-muted-foreground">
                {ROLE_LABEL[u.role]}
                {u.demo ? " · demo" : ""}
                {u.suspendedAt ? " · suspendida" : u.locked ? " · bloqueada por intentos" : ""}
              </span>
            </div>
            <span className="truncate text-xs text-muted-foreground">
              {u.email} · alta {when(u.createdAt)} · último acceso {when(u.lastLoginAt)} · {u.secondFactor ? "con 2FA o llave" : "sin 2FA"}
            </span>
            {!u.me && !u.demo ? (
              <div className="flex flex-wrap gap-2">
                {u.suspendedAt ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => act(u.id, "reactivate", u.name ?? u.email)}>
                    Reactivar
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => confirm(`¿Suspender el acceso de ${u.name ?? u.email}? No se borran sus datos.`) && act(u.id, "suspend", u.name ?? u.email)}
                  >
                    Suspender
                  </Button>
                )}
                <Button type="button" size="sm" variant="outline" onClick={() => act(u.id, "reset-password", u.name ?? u.email)} aria-label={`Enlace de contraseña nueva para ${u.email}`}>
                  Enlace de contraseña nueva
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
