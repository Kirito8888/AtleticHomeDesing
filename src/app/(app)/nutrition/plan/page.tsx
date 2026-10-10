import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MealPlanWeek } from "@/components/v17/nutrition-v17";
import { pageUser } from "@/lib/auth/page";
import { addDays, dateOnly, startOfIsoWeek, today, toIsoDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { weekDays } from "@/lib/nutrition/v17-nutrition";
import { mealPlanWeek } from "@/lib/nutrition/v17-service";

export const metadata = { title: "Plan de comidas · LifeOS" };

/** v1.7 · Plan semanal de comidas con tus recetas y la lista de la compra de la semana. */
export default async function MealPlanPage({ searchParams }: PageProps<"/nutrition/plan">) {
  const user = await pageUser();
  const { week: raw } = await searchParams;
  const ws = toIsoDay(startOfIsoWeek(typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? dateOnly(raw) : today()));
  const w = await mealPlanWeek(user.id, ws);
  return (
    <>
      <PageHeader title="Plan de comidas" description="Tus recetas repartidas en la semana; los ingredientes pasan a la lista de la compra con un toque." />
      <Card className="max-w-2xl gap-3 py-4">
        <CardHeader className="flex flex-row items-center justify-between px-4">
          <Button asChild variant="ghost" size="icon" aria-label="Semana anterior">
            <Link href={`?week=${toIsoDay(addDays(dateOnly(ws), -7))}`}>
              <ChevronLeft />
            </Link>
          </Button>
          <CardTitle className="text-sm">Semana del {formatDate(ws, { day: "numeric", month: "short" })}</CardTitle>
          <Button asChild variant="ghost" size="icon" aria-label="Semana siguiente">
            <Link href={`?week=${toIsoDay(addDays(dateOnly(ws), 7))}`}>
              <ChevronRight />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="px-4">
          <MealPlanWeek
            week={ws}
            days={weekDays(ws)}
            entries={w.entries.map((e) => ({ id: e.id, date: e.date, mealType: e.mealType, servings: e.servings, recipeName: e.recipeName }))}
            recipes={w.recipes.map((r) => ({ id: r.id, name: r.name }))}
            macros={w.macros}
          />
        </CardContent>
      </Card>
      <p className="mt-3 text-xs text-muted-foreground">
        <Link href="/nutrition/recipes" className="underline underline-offset-2">
          Recetas
        </Link>{" "}
        ·{" "}
        <Link href="/nutrition/shopping" className="underline underline-offset-2">
          Lista de la compra
        </Link>
      </p>
    </>
  );
}
