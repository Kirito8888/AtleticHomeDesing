import { CategorizeTx } from "@/components/finance/categorize";
import { DeleteTransaction, EditTransaction, SportToggle, type AccountOpt, type CategoryOpt } from "@/components/finance/finance-forms";
import { EditSplit, EditTransfer } from "@/components/finance/edit-lines";
import { Receipts } from "@/components/finance/season";
import { toIsoDay } from "@/lib/dates";
import { formatDate, formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Tx {
  id: string;
  date: Date;
  kind: string;
  description: string;
  sport: boolean;
  eventId: string | null;
  postings: Array<{ id: string; accountId: string; amountCents: number; categoryId: string | null; memo: string | null; account: { name: string; type: string; isArchived: boolean }; category: { name: string } | null }>;
  receipts: Array<{ id: string; mime: string }>;
}

/** Fila compacta: concepto e importe (verde = ingreso), fecha · categoría · cuenta y acciones de 44 px. */
export function TransactionRow({ t, accounts, categories }: { t: Tx; accounts: AccountOpt[]; categories: CategoryOpt[] }) {
  const moneyLeg = t.postings.find((p) => p.account.type === "ASSET" || p.account.type === "LIABILITY");
  const catLeg = t.postings.find((p) => p.category);
  const cat = catLeg?.category?.name;
  const amount = t.kind === "TRANSFER" ? Math.abs(moneyLeg?.amountCents ?? 0) : (moneyLeg?.amountCents ?? 0);
  const simple = t.kind === "EXPENSE" || t.kind === "INCOME";
  const label = t.kind === "TRANSFER" ? "Transferencia" : t.kind === "OPENING_BALANCE" ? "Saldo de apertura" : t.kind === "ADJUSTMENT" ? "Ajuste" : cat;
  const editable = simple && t.postings.length === 2 && moneyLeg && t.postings.some((p) => p !== moneyLeg && p.account.type !== "ASSET" && p.account.type !== "LIABILITY");
  const archived = t.postings.some((p) => p.account.isArchived);
  const isMoney = (p: Tx["postings"][number]) => p.account.type === "ASSET" || p.account.type === "LIABILITY";
  const lineTx = {
    id: t.id,
    date: toIsoDay(t.date),
    description: t.description,
    sport: t.sport,
    eventId: t.eventId,
    lines: t.postings.map((p) => ({ id: p.id, accountId: p.accountId, amountCents: p.amountCents, categoryId: p.categoryId, memo: p.memo })),
  };
  const isTransfer = t.kind === "TRANSFER" && t.postings.length === 2 && t.postings.every(isMoney);
  const isSplit = t.kind !== "OPENING_BALANCE" && !isTransfer && !editable && t.postings.length >= 2;
  return (
    <li className="grid gap-1 border-b pb-2 text-sm last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate">{t.description}</span>
        <span className={cn("shrink-0 font-medium tabular-nums", t.kind === "INCOME" && "text-emerald-700 dark:text-emerald-400")}>
          {t.kind === "TRANSFER" ? "⇄ " : amount > 0 ? "+" : ""}
          {formatEur(amount)}
        </span>
      </div>
      <div className="truncate text-xs text-muted-foreground">{[formatDate(t.date), label, moneyLeg?.account.name].filter(Boolean).join(" · ")}</div>
      <div className="flex flex-wrap items-center">
        {!archived && simple && !cat ? <CategorizeTx id={t.id} description={t.description} categories={categories.filter((c) => c.kind === t.kind)} /> : null}
        {t.kind === "EXPENSE" ? <Receipts transactionId={t.id} receipts={t.receipts} /> : null}
        {!archived && simple ? <SportToggle id={t.id} sport={t.sport} income={t.kind === "INCOME"} /> : null}
        {archived ? <span className="px-3 text-xs text-muted-foreground">Cuenta archivada</span> : null}
        {!archived && isTransfer ? <EditTransfer tx={lineTx} accounts={accounts} /> : null}
        {!archived && isSplit ? <EditSplit tx={lineTx} accounts={accounts} categories={categories} /> : null}
        {!archived && editable && moneyLeg ? (
          <EditTransaction
            tx={{
              id: t.id,
              kind: t.kind as "EXPENSE" | "INCOME",
              date: toIsoDay(t.date),
              description: t.description,
              amountCents: Math.abs(moneyLeg.amountCents),
              accountId: moneyLeg.accountId,
              categoryId: catLeg?.categoryId ?? null,
              sport: t.sport,
              eventId: t.eventId,
            }}
            accounts={accounts}
            categories={categories}
          />
        ) : null}
        <DeleteTransaction id={t.id} />
      </div>
    </li>
  );
}
