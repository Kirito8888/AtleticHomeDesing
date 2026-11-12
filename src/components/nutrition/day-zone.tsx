"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { AddFoodSheet } from "@/components/nutrition/add-food-sheet";
import { DeleteEntry, IronToggle } from "@/components/nutrition/delete-entry";
import { FoodPhoto } from "@/components/nutrition/food-ai";
import { LoadTemplate, MealShortcuts, SaveMealFavorite } from "@/components/nutrition/meal-shortcuts";
import { MEAL_LABEL } from "@/components/nutrition/meals";
import { WaterCard } from "@/components/nutrition/water-card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ZoneProvider, useZoneData } from "@/components/zone-refresh";
import { addDays, dateOnly, toIsoDay } from "@/lib/dates";
import { capitalizeFirst, formatDate, formatNum } from "@/lib/format";
import { CARB_DAY_LABEL } from "@/lib/nutrition/carbs";
import type { NutritionDayView } from "@/lib/nutrition/day-view";

/** Zona de `/nutrition` (O16): todo lo que cambia al registrar o quitar; se recarga con `GET /api/nutrition/day-view`. */
export function NutritionDayZone({ initial, date, showIron }: { initial: NutritionDayView; date: string; showIron: boolean }) {
  const { data, reload } = useZoneData(initial, `/api/nutrition/day-view?date=${date}`);
  const { day, yesterday, favorites, water, recents } = data;
  const totals = day.totals as Record<"kcal" | "proteinG" | "carbsG" | "fatG", number>;
  const prev = toIsoDay(addDays(dateOnly(date), -1));
  const next = toIsoDay(addDays(dateOnly(date), 1));
  const meals = Object.keys(MEAL_LABEL) as Array<keyof typeof MEAL_LABEL>;

  return (
    <ZoneProvider reload={reload}>
      <PageHeader title="Nutrición" action={<AddFoodSheet date={date} menus={favorites} recents={recents} />} />
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

      <nav aria-label="Cocina" className="mb-4 flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/nutrition/shopping">Lista de la compra</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/nutrition/recipes">Recetas</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/nutrition/plan">Plan semanal</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/nutrition/sweat">Sudoración</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/nutrition/micros">Micronutrientes y mis alimentos</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/nutrition/composition">Composición corporal</Link>
        </Button>
      </nav>

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

      <div id="agua" className="mb-4 scroll-mt-20">
        <WaterCard date={date} ml={water.ml} target={water.target} hot={water.hot} hasSession={water.hasSession} maxTemp={water.maxTemp} />
      </div>
      <FoodPhoto date={date} />
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
                    <LoadTemplate date={date} mealType={m} templates={favorites} />
                    <SaveMealFavorite date={date} mealType={m} existing={favorites.map((f) => f.name)} />
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
                          {showIron ? <IronToggle id={e.id} name={name} initial={e.ironRich} /> : null}
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
      <p className="mt-6 text-xs text-muted-foreground">
        Datos de alimentos de{" "}
        <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener" className="underline underline-offset-2">
          Open Food Facts
        </a>{" "}
        (ODbL), © sus colaboradores.
      </p>
    </ZoneProvider>
  );
}
