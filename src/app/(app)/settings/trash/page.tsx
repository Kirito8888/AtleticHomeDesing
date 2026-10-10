import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { TrashList } from "@/components/settings/trash-list";
import { listTrash, TRASH_DAYS } from "@/lib/account/trash";
import { pageUser } from "@/lib/auth/page";

export const metadata = { title: "Papelera · Atlenza" };

/** v1.8 · Sesiones, comidas y movimientos borrados en los últimos 7 días. */
export default async function TrashPage() {
  const user = await pageUser();
  const items = await listTrash(user.id);
  return (
    <>
      <PageHeader title="Papelera" description={`Lo que borras se guarda ${TRASH_DAYS} días por si te equivocas. Después se borra del todo.`} />
      <div className="max-w-xl">
        <TrashList items={items.map((i) => ({ id: i.id, kind: i.kind, label: i.label, deletedAt: i.deletedAt.toISOString(), daysLeft: i.daysLeft }))} />
        <p className="mt-3 text-xs text-muted-foreground">
          <Link href="/settings" className="underline underline-offset-2">
            Volver a Ajustes
          </Link>
        </p>
      </div>
    </>
  );
}
