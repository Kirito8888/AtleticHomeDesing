import { NutritionDayZone } from "@/components/nutrition/day-zone";
import { pageUser } from "@/lib/auth/page";
import { today, toIsoDay } from "@/lib/dates";
import { womenEnabled } from "@/lib/health/women-service";
import { nutritionDayView } from "@/lib/nutrition/day-view";

export const metadata = { title: "Nutrición · Atlenza" };

export default async function NutritionPage({ searchParams }: PageProps<"/nutrition">) {
  const user = await pageUser();
  const { date: raw } = await searchParams;
  const date = typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : toIsoDay(today());
  const [showIron, view] = await Promise.all([womenEnabled(user.id), nutritionDayView(user.id, date)]);
  return <NutritionDayZone initial={view} date={date} showIron={showIron} />;
}
