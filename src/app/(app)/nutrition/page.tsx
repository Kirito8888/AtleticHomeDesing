import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { AddFoodSheet } from "@/components/nutrition/add-food-sheet";
import { DeleteEntry } from "@/components/nutrition/delete-entry";
import { MealShortcuts, SaveMealFavorite } from "@/components/nutrition/meal-shortcuts";
import { MEAL_LABEL } from "@/components/nutrition/meals";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { pageUser } from "@/lib/auth/page";
import { addDays, dateOnly, today, toIsoDay } from "@/lib/dates";
import { capitalizeFirst, formatDate, formatNum } from "@/lib/format";
import { listMealTemplates, mealsOfPreviousDay } from "@/lib/nutrition/meal-templates";
import { getDay } from "@/lib/nutrition/service";
import { CARB_DAY_LABEL } from "@/lib/nutrition/carbs";
import { WaterCard } from "@/components/nutrition/water-card";
import { hydrationDay } from "@/lib/nutrition/hydration-service";

export const metadata = { title: "Nutrición · LifeOS" };

export default async function NutritionPage({ searchParams }: PageProps<"/nutrition">) {
  const user = await pageUser();
  const { date: raw } = await searchParams;
  const date = typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : toIsoDay(today());
  const [day, yesterday, favorites, water] = await Promise.all([
    getDay(user.id, date),
    mealsOfPreviousDay(user.id, date),
    listMealTemplates(user.id),
    hydrationDay(user.id, date),
  ]);
  const totals = day.totals as Record<"kcal" | "proteinG" | "carbsG" | "fatG", number>;
  const prev = toIsoDay(addDays(dateOnly(date), -1));
  const next = toIsoDay(addDays(dateOnly(date), 1));
  const meals = Object.keys(MEAL_LABEL) as Array<keyof typeof MEAL_LABEL>;

  return (
    <>
      <PageHeader title="Nutrición" action={<AddFoodSheet date={date} />} />
      <div className="mb-4 flex items-center justify-between">
        <Button asChild variant="ghost" size="icon" aria-label="Día anterior">
          <Link href={`?date=${prev}`}>
            <ChevronLeft />
          </Link>
        </Button>
        <div className="text-center">
          <div className="font-semibold">{capitalizeFirst(formatDate(date, { weekday: "long", day: "numeric", month: "long" }))}</div>
          {day.carbsAdjusted ? (
            <div className="text-xs text-muted-foreground">Hidratos de {CARB_DAY_LABEL[day.carbDay]}</div>
          ) : day.isTrainingDay ? (
            <div className="text-xs text-muted-foreground">Día de entreno</div>
          ) : null}
        </div>
        <Button asChild variant="ghost" size="icon" aria-label="Día siguiente">
          <Link href={`?date=${next}`}>
            <ChevronRight />
          </Link>
        </Button>
      </div>

      <Card className="mb-4 py-4">
        <CardContent className="grid gap-3 px-4 sm:grid-cols-2">
          {(
            [
              ["Energía", totals.kcal, day.goal?.kcal, "kcal"],
              ["Proteína", totals.proteinG, day.goal?.proteinG, "g"],
              ["Hidratos", totals.carbsG, day.goal?.carbsG, "g"],
              ["Grasa", totals.fatG, day.goal?.fatG, "g"],
            ] as const
          ).map(([label, value, goal, unit]) => (
            <div key={label} className="grid gap-1">
              <div className="flex justify-between text-sm">
                <span>{label}</span>
                <span className="tabular-nums">
                  <span className="font-semibold">{Math.round(value)}</span>
                  <span className="text-muted-foreground">
                    {goal ? ` / ${goal}` : ""} {unit}
                  </span>
                </span>
              </div>
              {goal ? <Progress value={(value / goal) * 100} aria-label={label} /> : null}
            </div>
          ))}
          {!day.goal ? <p className="text-xs text-muted-foreground sm:col-span-2">Define tu objetivo diario en Ajustes para ver el progreso.</p> : null}
        </CardContent>
      </Card>

      <div className="mb-4">
        <WaterCard date={date} ml={water.ml} target={water.target} hot={water.hot} hasSession={water.hasSession} maxTemp={water.maxTemp} />
      </div>
      <MealShortcuts date={date} yesterday={yesterday} favorites={favorites} />

      <div className="grid gap-3">
        {meals
          .filter((m) => day.entries.some((e) => e.mealType === m))
          .map((m) => {
            const list = day.entries.filter((e) => e.mealType === m);
            const kcal = list.reduce((a, e) => a + e.kcal, 0);
            return (
              <Card key={m} className="gap-2 py-3">
                <CardHeader className="flex flex-row items-center justify-between px-4">
                  <CardTitle className="text-sm">{MEAL_LABEL[m]}</CardTitle>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                    {Math.round(kcal)} kcal
                    <SaveMealFavorite date={date} mealType={m} />
                  </span>
                </CardHeader>
                <CardContent className="px-4">
                  <ul className="grid gap-1">
                    {list.map((e) => {
                      const name = e.foodProduct?.name ?? e.customName ?? "Alimento";
                      return (
                        <li key={e.id} className="flex items-center gap-2 text-sm">
                          <div className="min-w-0 flex-1">
                            <div className="truncate">{name}</div>
                            <div className="text-xs text-muted-foreground tabular-nums">
                              {formatNum(e.quantityG, 1)} g · P {formatNum(e.proteinG)} · H {formatNum(e.carbsG)} · G {formatNum(e.fatG)}
                            </div>
                          </div>
                          <span className="shrink-0 tabular-nums">{Math.round(e.kcal)}</span>
                          <DeleteEntry id={e.id} name={name} />
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        {!day.entries.length ? <p className="text-sm text-muted-foreground">Nada registrado este día.</p> : null}
      </div>
    </>
  );
}
