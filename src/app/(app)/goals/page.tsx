import Link from "next/link";

import { GoalList, NewGoal } from "@/components/goals/goals";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { TECHNICAL_EVENT_LABEL } from "@/lib/format";
import { listGoals } from "@/lib/goals/service";
import { prisma } from "@/lib/prisma";
import { TEST_CATALOG } from "@/lib/training/physical-tests";

export const metadata = { title: "Objetivos · Atlenza" };

/** v1.8 · Objetivos con progreso automático (marcas, tests, rachas y gasto) o a mano. */
export default async function GoalsPage() {
  const user = await pageUser();
  const [goals, ownTests, habits, categories] = await Promise.all([
    listGoals(user.id),
    prisma.testResult.findMany({ where: { userId: user.id }, distinct: ["testKey"], select: { testKey: true, name: true, unit: true, higherIsBetter: true } }),
    prisma.habit.findMany({ where: { userId: user.id, archived: false }, select: { id: true, name: true } }),
    prisma.financialCategory.findMany({ where: { userId: user.id, kind: "EXPENSE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const tests = new Map<string, { value: string; label: string; unit: string; higherIsBetter: boolean }>();
  for (const [k, t] of Object.entries(TEST_CATALOG)) tests.set(k, { value: k, label: t.name, unit: t.unit, higherIsBetter: t.higherIsBetter });
  for (const t of ownTests) tests.set(t.testKey, { value: t.testKey, label: t.name, unit: t.unit, higherIsBetter: t.higherIsBetter });
  return (
    <>
      <PageHeader
        title="Objetivos"
        description="El progreso se calcula solo con lo que ya registras: mejores marcas, último test, racha del hábito o gasto del mes."
        action={
          <Link href="/review" className="text-sm font-medium underline underline-offset-4">
            Revisión semanal
          </Link>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-sm">Mis objetivos</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <GoalList goals={goals.map((g) => ({ id: g.id, kind: g.kind, title: g.title, target: g.target, unit: g.unit, dueOn: g.dueOn, doneAt: g.doneAt?.toISOString() ?? null, progress: g.progress }))} />
          </CardContent>
        </Card>
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-sm">Nuevo objetivo</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <NewGoal
              options={{
                events: Object.entries(TECHNICAL_EVENT_LABEL).map(([value, label]) => ({ value, label })),
                tests: [...tests.values()],
                habits: habits.map((h) => ({ value: h.id, label: h.name })),
                categories: categories.map((c) => ({ value: c.id, label: c.name })),
              }}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
