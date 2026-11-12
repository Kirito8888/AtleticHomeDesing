"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { confirmDialog } from "@/components/ui/confirm-dialog";
import { api } from "@/lib/client-api";
import { formatEur } from "@/lib/format";

interface Acc {
  id: string;
  name: string;
  type: string;
  balanceCents: number;
}

function useArchive() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const set = async (id: string, isArchived: boolean, ok: string) => {
    setBusy(true);
    try {
      await api(`/api/finance/accounts/${id}`, { method: "PATCH", body: { isArchived } });
      toast.success(ok);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, set };
}

/** Archiva una cuenta tras confirmar; avisa si todavía tiene saldo. */
export function ArchiveAccountButton({ account }: { account: Acc }) {
  const { busy, set } = useArchive();
  return (
    <button
      type="button"
      aria-label={`Archivar ${account.name}`}
      disabled={busy}
      className="min-h-11 px-3 text-xs text-muted-foreground hover:underline disabled:opacity-50"
      onClick={async () => {
        const description =
          account.balanceCents !== 0
            ? `Tiene ${formatEur(account.balanceCents)}. Seguirá contando en el balance total, pero no podrás anotar en ella hasta reactivarla.`
            : "No podrás anotar movimientos en ella hasta reactivarla.";
        if (!(await confirmDialog({ title: `¿Archivar «${account.name}»?`, description, confirmLabel: "Archivar" }))) return;
        await set(account.id, true, "Cuenta archivada");
      }}
    >
      Archivar
    </button>
  );
}

/** Apartado plegable con las cuentas archivadas y el botón para reactivarlas. */
export function ArchivedAccounts({ accounts }: { accounts: Acc[] }) {
  const { busy, set } = useArchive();
  if (!accounts.length) return null;
  return (
    <details className="mb-6 rounded-md border">
      <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm text-muted-foreground">Archivadas ({accounts.length})</summary>
      <ul aria-label="Cuentas archivadas" className="grid gap-1 px-3 pb-2">
        {accounts.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">
              {a.name} · <span className="tabular-nums">{formatEur(a.balanceCents)}</span>
            </span>
            <button
              type="button"
              aria-label={`Reactivar ${a.name}`}
              disabled={busy}
              className="h-11 shrink-0 px-3 text-xs underline disabled:opacity-50"
              onClick={() => set(a.id, false, "Cuenta reactivada")}
            >
              Reactivar
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
