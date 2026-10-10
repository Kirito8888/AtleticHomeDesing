import { PageHeader } from "@/components/page-header";
import { RecipeActions, RecipeBuilder } from "@/components/nutrition/kitchen";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { today, toIsoDay } from "@/lib/dates";
import { recipeMacros, recipeSchema } from "@/lib/nutrition/kitchen";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Recetas · Atlenza" };

export default async function RecipesPage() {
  const user = await pageUser();
  const day = toIsoDay(today());
  const rows = await prisma.recipe.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } });
  const recipes = rows.flatMap((r) => {
    const p = recipeSchema.safeParse({ name: r.name, servings: r.servings, items: r.items });
    return p.success ? [{ id: r.id, ...p.data, m: recipeMacros(p.data.items, p.data.servings) }] : [];
  });
  return (
    <>
      <PageHeader title="Recetas" description="Tus platos con sus macros por ración; anótalos en el día o pásalos a favoritas." />
      <div className="grid gap-4 lg:grid-cols-[24rem_1fr]">
        <Card className="h-fit gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">Nueva receta</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <RecipeBuilder />
          </CardContent>
        </Card>
        <div className="grid h-fit gap-3" aria-label="Mis recetas">
          {recipes.map((r) => (
            <Card key={r.id} className="gap-2 py-3">
              <CardContent className="grid gap-2 px-4 text-sm">
                <p className="font-medium">
                  {r.name} <span className="text-xs font-normal text-muted-foreground">· {r.servings} raciones</span>
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  Por ración ({r.m.perServing.grams} g): {r.m.perServing.kcal} kcal · P {r.m.perServing.proteinG} · H {r.m.perServing.carbsG} · G {r.m.perServing.fatG}
                </p>
                <RecipeActions id={r.id} name={r.name} today={day} />
              </CardContent>
            </Card>
          ))}
          {!recipes.length ? <p className="text-sm text-muted-foreground">Aún no hay recetas.</p> : null}
        </div>
      </div>
    </>
  );
}
