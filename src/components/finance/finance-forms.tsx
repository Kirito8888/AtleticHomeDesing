"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { Chips, Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/client-api";
import { toCents } from "@/lib/finance/ledger";

export interface AccountOpt {
  id: string;
  name: string;
  type: string;
}
export interface CategoryOpt {
  id: string;
  name: string;
  kind: string;
}

type Kind = "EXPENSE" | "INCOME" | "TRANSFER";

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

export function QuickTransaction({ accounts, categories, today }: { accounts: AccountOpt[]; categories: CategoryOpt[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("EXPENSE");
  const { busy, run } = useSubmit(() => setOpen(false));
  const money = accounts.filter((a) => a.type === "ASSET" || a.type === "LIABILITY");
  const cats = categories.filter((c) => c.kind === (kind === "INCOME" ? "INCOME" : "EXPENSE"));

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
          <SheetDescription>Se registra en partida doble automáticamente.</SheetDescription>
        </SheetHeader>
        {money.length ? (
          <form
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
                },
                "Movimiento guardado",
              );
            }}
          >
            <Chips
              label="Tipo de movimiento"
              value={kind}
              onChange={(v) => v && setKind(v)}
              options={[
                { value: "EXPENSE", label: "Gasto" },
                { value: "INCOME", label: "Ingreso" },
                { value: "TRANSFER", label: "Transferencia" },
              ]}
            />
            <Field label="Importe (€)" htmlFor="t-amount">
              <Input id="t-amount" name="amount" inputMode="decimal" placeholder="12,50" className="h-12 text-xl font-semibold" required autoFocus />
            </Field>
            <Field label="Concepto" htmlFor="t-desc">
              <Input id="t-desc" name="description" required placeholder={kind === "EXPENSE" ? "Mercadona" : kind === "INCOME" ? "Nómina" : "Ahorro"} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={kind === "INCOME" ? "Cuenta de cobro" : "Desde"} htmlFor="t-acc">
                <Select id="t-acc" name="account">
                  {money.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
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
            <Field label="Fecha" htmlFor="t-date">
              <Input id="t-date" name="date" type="date" defaultValue={today} required />
            </Field>
            <Button type="submit" size="lg" disabled={busy}>
              Guardar
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">Crea primero una cuenta (banco, efectivo o tarjeta) en «Gestionar».</p>
        )}
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
          <Settings2 /> <span className="hidden sm:inline">Gestionar</span>
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Gestionar</SheetTitle>
        </SheetHeader>
        <Tabs defaultValue="account">
          <TabsList>
            <TabsTrigger value="account">Cuenta</TabsTrigger>
            <TabsTrigger value="category">Categoría</TabsTrigger>
            <TabsTrigger value="budget">Presup.</TabsTrigger>
            <TabsTrigger value="sub">Suscr.</TabsTrigger>
          </TabsList>

          <TabsContent value="account">
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(
                  "/api/finance/accounts",
                  { name: str(f, "name"), type: str(f, "type"), institution: str(f, "institution"), openingBalanceCents: cents(f, "opening") ?? undefined },
                  "Cuenta creada",
                );
              }}
            >
              <Field label="Nombre" htmlFor="a-name">
                <Input id="a-name" name="name" required placeholder="Cuenta corriente" />
              </Field>
              <Field label="Tipo" htmlFor="a-type">
                <Select id="a-type" name="type" defaultValue="ASSET">
                  <option value="ASSET">Activo (banco, efectivo, inversión)</option>
                  <option value="LIABILITY">Pasivo (tarjeta de crédito, préstamo)</option>
                </Select>
              </Field>
              <Field label="Entidad" htmlFor="a-inst">
                <Input id="a-inst" name="institution" />
              </Field>
              <Field label="Saldo actual (€)" htmlFor="a-open" hint="En pasivos, la deuda en negativo (p.ej. -350).">
                <Input id="a-open" name="opening" inputMode="decimal" />
              </Field>
              <Button type="submit" disabled={busy}>
                Crear cuenta
              </Button>
            </form>
          </TabsContent>

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
      className="text-xs text-muted-foreground hover:underline"
      onClick={async () => {
        if (!confirm("¿Borrar el movimiento?")) return;
        try {
          await api(`/api/finance/transactions/${id}`, { method: "DELETE" });
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
