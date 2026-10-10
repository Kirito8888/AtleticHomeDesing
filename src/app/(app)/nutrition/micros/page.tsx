import { DeleteOwnFood, MicroTargetsForm, OwnFoodWithLabel } from "@/components/nutrition/micros-forms";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { pageUser } from "@/lib/auth/page";
import { MICRO_SOURCE, microTargets } from "@/lib/nutrition/micros";
import { microsOverview } from "@/lib/nutrition/micros-service";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Micronutrientes · Atlenza" };

/** v1.10 · Micronutrientes de la última semana, objetivos y alimentos propios. */
export default async function MicrosPage() {
  const user = await pageUser();
  const [o, own] = await Promise.all([microsOverview(user.id), prisma.foodProduct.findMany({ where: { ownerId: user.id }, orderBy: { name: "asc" }, select: { id: true, name: true, brand: true, kcalPer100g: true } })]);
  const refs = microTargets({}, o.sex);
  return (
    <>
      <PageHeader title="Micronutrientes" description="Media diaria de los últimos 7 días con algo anotado, frente a tus objetivos. Orientativo: no sustituye a un análisis ni a tu nutricionista." />
      <div className="grid gap-4">
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">Última semana</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 px-4 text-sm">
            {o.entries === 0 ? <p className="text-muted-foreground">Aún no has anotado comidas esta semana.</p> : null}
            {o.rows.map((r) => (
              <div key={r.micro} className="grid gap-1">
                <div className="flex justify-between gap-2">
                  <span>{r.label}</span>
                  <span className="tabular-nums">
                    <span className="font-semibold">{r.avg}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      / {r.target} {r.unit} {r.kind === "max" ? "(máximo)" : ""}
                    </span>
                  </span>
                </div>
                <Progress value={Math.min(100, r.pct ?? 0)} aria-label={r.label} />
                {o.entries > 0 && r.coverage < 60 ? <p className="text-xs text-muted-foreground">Solo el {r.coverage} % de lo anotado trae este dato: la media se queda corta.</p> : null}
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">Mis objetivos</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 px-4 text-sm">
            <p className="text-xs text-muted-foreground">Vacío = referencia general para adultos ({MICRO_SOURCE}). Si tienes indicaciones de tu médica o nutricionista, ponlas aquí.</p>
            <MicroTargetsForm custom={o.custom} refs={refs} />
          </CardContent>
        </Card>
        <Card id="propios" className="scroll-mt-20 gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">Mis alimentos</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 px-4 text-sm">
            {own.length ? (
              <ul className="grid gap-1" aria-label="Mis alimentos">
                {own.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                    <span className="min-w-0 truncate">
                      {f.name}
                      {f.brand ? <span className="text-muted-foreground"> · {f.brand}</span> : null}
                      <span className="text-muted-foreground"> · {f.kcalPer100g ?? "—"} kcal/100 g</span>
                    </span>
                    <DeleteOwnFood id={f.id} name={f.name} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">Lo que no esté en el catálogo, añádelo aquí con los valores de la etiqueta.</p>
            )}
            <OwnFoodWithLabel />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
