import { PageHeader } from "@/components/page-header";
import { RuleAlerts } from "@/components/rules/rule-alerts";
import { EquipmentActions, EquipmentForm } from "@/components/training/equipment";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { pageUser } from "@/lib/auth/page";
import { addDays, today, toIsoDay } from "@/lib/dates";
import { formatDate, formatEur } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { EQUIPMENT_KINDS, equipmentAlerts, type EquipmentKind } from "@/lib/training/equipment";
import { listEquipment } from "@/lib/training/equipment-service";
import { cn } from "@/lib/utils";

export const metadata = { title: "Material · Atlenza" };

export default async function EquipmentPage() {
  const user = await pageUser();
  const now = today();
  const todayIso = toIsoDay(now);
  const [items, expenses] = await Promise.all([
    listEquipment(user.id, todayIso),
    prisma.financialTransaction.findMany({
      where: { userId: user.id, kind: "EXPENSE", sport: true, date: { gte: addDays(now, -400) } },
      orderBy: { date: "desc" },
      take: 40,
      select: { id: true, date: true, description: true },
    }),
  ]);
  const alerts = equipmentAlerts(items);

  return (
    <>
      <PageHeader title="Material" description="Jabalinas, clavos y zapatillas: uso, vida útil y cuándo reponer" />
      <RuleAlerts alerts={alerts} label="Avisos de material" link={null} />
      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        <Card className="h-fit gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">Nuevo material</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <EquipmentForm today={todayIso} expenses={expenses.map((e) => ({ id: e.id, label: `${formatDate(e.date)} · ${e.description}` }))} />
          </CardContent>
        </Card>
        <div className="grid h-fit gap-3" aria-label="Inventario">
          {items.length ? (
            items.map((i) => (
              <Card key={i.id} className={cn("gap-2 py-3", i.retired && "opacity-60")}>
                <CardContent className="grid gap-2 px-4 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-medium">
                      {i.name}
                      {i.retired ? " · retirado" : ""}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {EQUIPMENT_KINDS[i.kind as EquipmentKind]?.label ?? i.kind}
                      {i.implementWeightG ? ` · ${i.implementWeightG} g` : ""}
                      {i.purchasedOn ? ` · desde ${formatDate(i.purchasedOn, { day: "numeric", month: "short", year: "numeric" })}` : ""}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {i.state.uses} {EQUIPMENT_KINDS[i.kind as EquipmentKind]?.unit ?? "usos"}
                    {i.lifeUses ? ` de ${i.lifeUses}` : ""}
                    {i.state.months != null && i.lifeMonths ? ` · ${i.state.months} de ${i.lifeMonths} meses` : ""}
                    {i.purchase ? ` · compra ${formatEur(i.purchase.cents)}` : ""}
                  </p>
                  {i.state.wearPct != null ? (
                    <div className="flex items-center gap-2">
                      <Progress value={Math.min(100, i.state.wearPct)} aria-label={`Desgaste de ${i.name}`} indicatorClassName={i.state.level === "replace" ? "bg-destructive" : undefined} />
                      <span className={cn("w-12 shrink-0 text-right text-xs tabular-nums", i.state.level !== "ok" && "font-medium text-destructive")}>{i.state.wearPct} %</span>
                    </div>
                  ) : null}
                  <EquipmentActions id={i.id} name={i.name} retired={i.retired} />
                </CardContent>
              </Card>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Aún no hay material. Las jabalinas cuentan solas los lanzamientos registrados con su peso desde la fecha de compra.</p>
          )}
        </div>
      </div>
    </>
  );
}
