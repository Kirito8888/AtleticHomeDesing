"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Plus, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { Chips, Field } from "@/components/form/chips";
import { AccountPicker, pickAccount } from "@/components/finance/account-picker";
import { OcrFill } from "@/components/ocr-fill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/client-api";
import { trashedToast } from "@/lib/trash-client";
import { toCents } from "@/lib/finance/ledger";
import { confirmDialog } from "@/components/ui/confirm-dialog";

export interface AccountOpt {
  id: string;
  name: string;
  type: string;
  balanceCents?: number;
  isArchived?: boolean;
}
export interface CategoryOpt {
  id: string;
  name: string;
  kind: string;
}

type Kind = "EXPENSE" | "INCOME" | "TRANSFER";

const LAST_ACCOUNT_KEY = "atlenza.finance.lastAccount";
// Comodidad por dispositivo: si el almacenamiento no está disponible, se usa la primera cuenta.
const readLastAccount = () => {
  try {
    return localStorage.getItem(LAST_ACCOUNT_KEY);
  } catch {
    return null;
  }
};
const saveLastAccount = (id: string) => {
  try {
    localStorage.setItem(LAST_ACCOUNT_KEY, id);
  } catch {
    /* sin almacenamiento */
  }
};

function useSubmit(onDone: () => void) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async (url: string, body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try {
      await api(url, { body });
      toast.success(ok);
      onDone();
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

function cents(f: FormData, k: string): number | null {
  const v = str(f, k);
  if (!v) return null;
  try {
    return toCents(v);
  } catch {
    toast.error(`Importe no válido: ${v}`);
    return null;
  }
}

export function QuickTransaction({
  accounts,
  categories,
  today,
  competitions = [],
}: {
  accounts: AccountOpt[];
  categories: CategoryOpt[];
  today: string;
  competitions?: Array<{ id: string; title: string; date: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("EXPENSE");
  const [sport, setSport] = useState(false);
  const { busy, run } = useSubmit(() => setOpen(false));
  const money = accounts.filter((a) => (a.type === "ASSET" || a.type === "LIABILITY") && !a.isArchived);
  const [chosen, setChosen] = useState<string | null>(null);
  // La elegida en esta sesión, si no la última guardada en el dispositivo, si no la primera.
  const accountId = pickAccount(money, chosen && money.some((a) => a.id === chosen) ? chosen : readLastAccount());
  const cats = categories.filter((c) => c.kind === (kind === "INCOME" ? "INCOME" : "EXPENSE"));
  const formRef = useRef<HTMLFormElement>(null);
  // v1.10 · Rellenar desde la foto de un ticket (OCR del servidor): solo propone, se revisa antes de guardar
  const fillFromReceipt = (r: { amount: number | null; date: string | null; merchant: string | null; found: boolean }) => {
    const f = formRef.current;
    if (!f) return;
    const set = (name: string, v: string | null) => {
      const el = f.elements.namedItem(name) as HTMLInputElement | null;
      if (el && v) el.value = v;
    };
    // Valor de un <input>: coma decimal y sin separador de miles, como lo escribe la persona.
    // eslint-disable-next-line no-restricted-syntax
    set("amount", r.amount != null ? r.amount.toFixed(2).replace(".", ",") : null);
    set("date", r.date);
    set("description", r.merchant);
    if (r.amount == null && !r.merchant) toast.error(r.found ? "No he encontrado el importe: rellénalo a mano" : "No he podido leer el ticket");
    else toast.success("Revisa los datos leídos del ticket antes de guardar");
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm">
          <Plus /> Movimiento
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Nuevo movimiento</SheetTitle>
          <SheetDescription>Los saldos se actualizan al guardar.</SheetDescription>
        </SheetHeader>
        {money.length ? (
          <form
            ref={formRef}
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const amountCents = cents(f, "amount");
              if (!amountCents || amountCents <= 0) return toast.error("Importe no válido");
              void run(
                "/api/finance/transactions",
                {
                  mode: "simple",
                  kind,
                  date: str(f, "date"),
                  description: str(f, "description"),
                  amountCents,
                  moneyAccountId: str(f, "account"),
                  counterAccountId: kind === "TRANSFER" ? str(f, "to") : undefined,
                  categoryId: kind === "TRANSFER" ? null : str(f, "category"),
                  sport: (kind === "EXPENSE" || kind === "INCOME") && sport,
                  eventId: kind === "EXPENSE" && sport ? str(f, "event") || null : null,
                },
                "Movimiento guardado",
              );
              const used = str(f, "account");
              if (used) saveLastAccount(used);
            }}
          >
            {kind === "TRANSFER" ? (
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium">Transferencia entre cuentas</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setKind("EXPENSE")}>
                  Volver a gasto o ingreso
                </Button>
              </div>
            ) : (
              <Chips
                label="Tipo de movimiento"
                value={kind}
                onChange={(v) => v && setKind(v)}
                className="grid grid-cols-2 [&_button]:h-11 [&_button]:rounded-md"
                options={[
                  { value: "EXPENSE", label: "Gasto" },
                  { value: "INCOME", label: "Ingreso" },
                ]}
              />
            )}
            {kind === "EXPENSE" ? <OcrFill endpoint="/api/ocr/receipt" label="Rellenar desde un ticket" onResult={fillFromReceipt} /> : null}
            <Field label="Importe (€)" htmlFor="t-amount">
              <Input id="t-amount" name="amount" inputMode="decimal" placeholder="12,50" className="h-12 text-xl font-semibold" required autoFocus />
            </Field>
            <div className="grid gap-3">
              {kind === "TRANSFER" ? (
                <Field label="Desde" htmlFor="t-acc">
                  <Select id="t-acc" name="account" defaultValue={accountId ?? undefined}>
                    {money.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : (
                <AccountPicker accounts={money} value={accountId} onChange={setChosen} label={kind === "INCOME" ? "Cuenta de cobro" : "Desde"} />
              )}
              {kind === "TRANSFER" ? (
                <Field label="Hacia" htmlFor="t-to">
                  <Select id="t-to" name="to" defaultValue={money[1]?.id}>
                    {money.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : (
                <Field label="Categoría" htmlFor="t-cat">
                  <Select id="t-cat" name="category" defaultValue="">
                    <option value="">Sin categoría</option>
                    {cats.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </div>
            <Field label="Concepto" htmlFor="t-desc">
              <Input id="t-desc" name="description" required placeholder={kind === "EXPENSE" ? "Mercadona" : kind === "INCOME" ? "Nómina" : "Ahorro"} />
            </Field>
            <Field label="Fecha" htmlFor="t-date">
              <Input id="t-date" name="date" type="date" defaultValue={today} required />
            </Field>
            {kind === "INCOME" ? (
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Ingreso deportivo (beca, premio, patrocinio)</span>
                <Switch checked={sport} onCheckedChange={setSport} aria-label="Ingreso deportivo" />
              </label>
            ) : null}
            {kind === "EXPENSE" ? (
              <div className="grid gap-2">
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>Gasto deportivo (material, viajes, licencias)</span>
                  <Switch checked={sport} onCheckedChange={setSport} aria-label="Gasto deportivo" />
                </label>
                {sport && competitions.length ? (
                  <Field label="Competición (opcional)" htmlFor="t-event">
                    <Select id="t-event" name="event" defaultValue="">
                      <option value="">Ninguna</option>
                      {competitions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title} · {c.date}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : null}
              </div>
            ) : null}
            <Button type="submit" size="lg" disabled={busy}>
              Guardar
            </Button>
            {kind !== "TRANSFER" && money.length > 1 ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setKind("TRANSFER")}>
                Transferir entre mis cuentas
              </Button>
            ) : null}
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">Crea primero una cuenta (banco, efectivo o tarjeta) con «Cuenta».</p>
        )}
      </SheetContent>
    </Sheet>
  );
}

const ACCOUNT_PRESETS = [
  { value: "checking", label: "Cuenta corriente", type: "ASSET" },
  { value: "savings", label: "Ahorro", type: "ASSET" },
  { value: "cash", label: "Efectivo", type: "ASSET" },
  { value: "card", label: "Tarjeta de crédito", type: "LIABILITY" },
] as const;

/** Cuenta en un solo paso: nombre, tipo y saldo inicial opcional. */
export function NewAccount({ first = false }: { first?: boolean }) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<(typeof ACCOUNT_PRESETS)[number]["value"]>("checking");
  const { busy, run } = useSubmit(() => setOpen(false));
  const current = ACCOUNT_PRESETS.find((p) => p.value === preset)!;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" variant={first ? "default" : "outline"}>
          <Plus /> Cuenta
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Nueva cuenta</SheetTitle>
          <SheetDescription>Pon el saldo que tiene hoy; si lo dejas vacío, empieza en 0.</SheetDescription>
        </SheetHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const name = str(f, "name") ?? current.label;
            void run("/api/finance/accounts", { name, type: current.type, openingBalanceCents: cents(f, "opening") ?? undefined }, "Cuenta creada");
          }}
        >
          <Chips
            label="Tipo de cuenta"
            value={preset}
            onChange={(v) => v && setPreset(v)}
            className="grid grid-cols-2 [&_button]:h-11 [&_button]:rounded-md"
            options={ACCOUNT_PRESETS.map((p) => ({ value: p.value, label: p.label }))}
          />
          <Field label="Nombre" htmlFor="a-name">
            <Input id="a-name" name="name" placeholder={current.label} />
          </Field>
          <Field label="Saldo inicial (€, opcional)" htmlFor="a-open" hint={current.type === "LIABILITY" ? "La deuda en negativo (p. ej. -350)." : undefined}>
            <Input id="a-open" name="opening" inputMode="decimal" placeholder="0,00" />
          </Field>
          <Button type="submit" size="lg" disabled={busy}>
            Crear cuenta
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function ManageFinance({ accounts, categories, today }: { accounts: AccountOpt[]; categories: CategoryOpt[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [autoPost, setAutoPost] = useState(true);
  const { busy, run } = useSubmit(() => setOpen(false));
  const money = accounts.filter((a) => a.type === "ASSET" || a.type === "LIABILITY");
  const expenseCats = categories.filter((c) => c.kind === "EXPENSE");

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline" aria-label="Gestionar">
          <Settings2 /> Gestionar
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Gestionar</SheetTitle>
        </SheetHeader>
        <Tabs defaultValue="category">
          <TabsList>
            <TabsTrigger value="category">Categoría</TabsTrigger>
            <TabsTrigger value="budget">Presup.</TabsTrigger>
            <TabsTrigger value="sub">Suscr.</TabsTrigger>
          </TabsList>

          <TabsContent value="category">
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run("/api/finance/categories", { name: str(f, "name"), kind: str(f, "kind"), parentId: str(f, "parent") }, "Categoría creada");
              }}
            >
              <Field label="Nombre" htmlFor="c-name">
                <Input id="c-name" name="name" required placeholder="Supermercado" />
              </Field>
              <Field label="Tipo" htmlFor="c-kind">
                <Select id="c-kind" name="kind" defaultValue="EXPENSE">
                  <option value="EXPENSE">Gasto</option>
                  <option value="INCOME">Ingreso</option>
                </Select>
              </Field>
              {categories.length ? (
                <Field label="Dentro de" htmlFor="c-parent">
                  <Select id="c-parent" name="parent" defaultValue="">
                    <option value="">—</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
              <Button type="submit" disabled={busy}>
                Crear categoría
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="budget">
            {expenseCats.length ? (
              <form
                className="grid gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(
                    "/api/finance/budgets",
                    {
                      categoryId: str(f, "category"),
                      period: str(f, "period"),
                      amountCents: cents(f, "amount"),
                      alertThresholdPct: Number(str(f, "alert") ?? 80),
                      startDate: today,
                    },
                    "Presupuesto creado",
                  );
                }}
              >
                <Field label="Categoría" htmlFor="b-cat">
                  <Select id="b-cat" name="category">
                    {expenseCats.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Importe (€)" htmlFor="b-amount">
                    <Input id="b-amount" name="amount" inputMode="decimal" required />
                  </Field>
                  <Field label="Periodo" htmlFor="b-period">
                    <Select id="b-period" name="period" defaultValue="MONTHLY">
                      <option value="WEEKLY">Semanal</option>
                      <option value="MONTHLY">Mensual</option>
                      <option value="QUARTERLY">Trimestral</option>
                      <option value="YEARLY">Anual</option>
                    </Select>
                  </Field>
                </div>
                <Field label="Avisar al llegar al (%)" htmlFor="b-alert">
                  <Input id="b-alert" name="alert" inputMode="numeric" defaultValue="80" />
                </Field>
                <Button type="submit" disabled={busy}>
                  Crear presupuesto
                </Button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">Crea antes una categoría de gasto.</p>
            )}
          </TabsContent>

          <TabsContent value="sub">
            {money.length ? (
              <form
                className="grid gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(
                    "/api/finance/subscriptions",
                    {
                      name: str(f, "name"),
                      amountCents: cents(f, "amount"),
                      interval: str(f, "interval"),
                      nextChargeDate: str(f, "next"),
                      accountId: str(f, "account"),
                      categoryId: str(f, "category"),
                      autoPost,
                    },
                    "Suscripción creada",
                  );
                }}
              >
                <Field label="Nombre" htmlFor="s-name">
                  <Input id="s-name" name="name" required placeholder="Gimnasio" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Importe (€)" htmlFor="s-amount">
                    <Input id="s-amount" name="amount" inputMode="decimal" required />
                  </Field>
                  <Field label="Cada" htmlFor="s-int">
                    <Select id="s-int" name="interval" defaultValue="MONTHLY">
                      <option value="WEEKLY">Semana</option>
                      <option value="MONTHLY">Mes</option>
                      <option value="QUARTERLY">Trimestre</option>
                      <option value="YEARLY">Año</option>
                    </Select>
                  </Field>
                  <Field label="Próximo cobro" htmlFor="s-next">
                    <Input id="s-next" name="next" type="date" defaultValue={today} required />
                  </Field>
                  <Field label="Cuenta" htmlFor="s-acc">
                    <Select id="s-acc" name="account">
                      {money.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field label="Categoría" htmlFor="s-cat">
                  <Select id="s-cat" name="category" defaultValue="">
                    <option value="">Sin categoría</option>
                    {expenseCats.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={autoPost} onCheckedChange={setAutoPost} /> Contabilizar automáticamente cada cobro
                </label>
                <Button type="submit" disabled={busy}>
                  Crear suscripción
                </Button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">Crea antes una cuenta.</p>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

export function RunSubscriptionsButton() {
  const router = useRouter();
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        try {
          const r = await api<{ posted: unknown[] }>("/api/finance/subscriptions/run", { method: "POST" });
          toast.success(r.posted.length ? `${r.posted.length} cobro(s) contabilizado(s)` : "No hay cobros pendientes");
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message);
        }
      }}
    >
      Contabilizar vencidas
    </Button>
  );
}

export function DeleteTransaction({ id }: { id: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="min-h-11 px-3 text-xs text-muted-foreground hover:underline"
      onClick={async () => {
        if (!(await confirmDialog({ title: "¿Borrar el movimiento?", confirmLabel: "Borrar", destructive: true }))) return;
        try {
          const r = await api<{ trashId?: string }>(`/api/finance/transactions/${id}`, { method: "DELETE" });
          trashedToast(r.trashId, "Movimiento borrado", () => router.refresh());
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message);
        }
      }}
    >
      Borrar
    </button>
  );
}

/** Marca o desmarca un gasto o ingreso como deportivo. */
export function SportToggle({ id, sport, income = false }: { id: string; sport: boolean; income?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={busy}
      aria-pressed={sport}
      aria-label={income ? (sport ? "Quitar de ingresos deportivos" : "Marcar como ingreso deportivo") : sport ? "Quitar de gastos deportivos" : "Marcar como gasto deportivo"}
      className={sport ? "" : "opacity-40"}
      onClick={async () => {
        setBusy(true);
        try {
          await api(`/api/finance/transactions/${id}`, { method: "PATCH", body: { sport: !sport, eventId: null } });
          router.refresh();
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      🏅
    </Button>
  );
}

export interface EditableTx {
  id: string;
  kind: "EXPENSE" | "INCOME";
  date: string;
  description: string;
  amountCents: number;
  accountId: string;
  categoryId: string | null;
  sport: boolean;
  eventId: string | null;
}

/** Edita importe, cuenta, categoría, fecha, concepto y tipo; al guardar se refrescan listado y saldos. */
export function EditTransaction({ tx, accounts, categories }: { tx: EditableTx; accounts: AccountOpt[]; categories: CategoryOpt[] }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"EXPENSE" | "INCOME">(tx.kind);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const money = accounts.filter((a) => a.type === "ASSET" || a.type === "LIABILITY");
  const cats = categories.filter((c) => c.kind === kind);
  // Valor de un <input>: coma decimal y sin separador de miles, como lo escribe la persona.
  // eslint-disable-next-line no-restricted-syntax
  const amountText = (tx.amountCents / 100).toFixed(2).replace(".", ",");
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setKind(tx.kind);
      }}
    >
      <SheetTrigger asChild>
        <button type="button" className="min-h-11 px-3 text-xs text-muted-foreground hover:underline">
          Editar
        </button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Editar movimiento</SheetTitle>
          <SheetDescription>Los saldos se recalculan al guardar.</SheetDescription>
        </SheetHeader>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const amountCents = cents(f, "amount");
            if (!amountCents || amountCents <= 0) return toast.error("Importe no válido");
            setBusy(true);
            try {
              await api(`/api/finance/transactions/${tx.id}`, {
                method: "PUT",
                body: {
                  kind,
                  date: str(f, "date"),
                  description: str(f, "description"),
                  amountCents,
                  moneyAccountId: str(f, "account"),
                  categoryId: str(f, "category"),
                  sport: tx.sport,
                  eventId: tx.eventId,
                },
              });
              toast.success("Movimiento actualizado");
              setOpen(false);
              router.refresh();
            } catch (err) {
              toast.error((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Chips
            label="Tipo de movimiento"
            value={kind}
            onChange={(v) => v && setKind(v)}
            className="grid grid-cols-2 [&_button]:h-11 [&_button]:rounded-md"
            options={[
              { value: "EXPENSE", label: "Gasto" },
              { value: "INCOME", label: "Ingreso" },
            ]}
          />
          <Field label="Importe (€)" htmlFor={`e-amount-${tx.id}`}>
            <Input id={`e-amount-${tx.id}`} name="amount" inputMode="decimal" defaultValue={amountText} className="h-12 text-xl font-semibold" required />
          </Field>
          <Field label={kind === "INCOME" ? "Cuenta de cobro" : "Desde"} htmlFor={`e-acc-${tx.id}`}>
            <Select id={`e-acc-${tx.id}`} name="account" defaultValue={tx.accountId}>
              {money.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Categoría" htmlFor={`e-cat-${tx.id}`}>
            <Select key={kind} id={`e-cat-${tx.id}`} name="category" defaultValue={kind === tx.kind ? (tx.categoryId ?? "") : ""}>
              <option value="">Sin categoría</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Concepto" htmlFor={`e-desc-${tx.id}`}>
            <Input id={`e-desc-${tx.id}`} name="description" defaultValue={tx.description} required />
          </Field>
          <Field label="Fecha" htmlFor={`e-date-${tx.id}`}>
            <Input id={`e-date-${tx.id}`} name="date" type="date" defaultValue={tx.date} required />
          </Field>
          <Button type="submit" size="lg" disabled={busy}>
            Guardar cambios
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
