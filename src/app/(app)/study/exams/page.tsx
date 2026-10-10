import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { ExamPlanForm, GradesPanel, StudyBlocks } from "@/components/study/exam-plan";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { today, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { gradeAverage } from "@/lib/study/exam-plan";
import { examPlanView } from "@/lib/study/exam-plan-service";

export const metadata = { title: "Exámenes y notas · Atlenza" };

export default async function ExamsPage() {
  const user = await pageUser();
  const [view, grades] = await Promise.all([
    examPlanView(user.id, toIsoDay(today())),
    prisma.grade.findMany({ where: { userId: user.id }, orderBy: [{ term: "asc" }, { subject: "asc" }], select: { id: true, subject: true, term: true, grade: true, credits: true } }),
  ]);
  const avg = gradeAverage(grades);
  return (
    <>
      <PageHeader title="Exámenes y notas" description="Plan de estudio hasta cada examen y tu media ponderada por créditos." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="h-fit gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">Plan hasta el examen</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 px-4">
            <ExamPlanForm exams={view.exams} />
            <StudyBlocks blocks={view.blocks} />
          </CardContent>
        </Card>
        <Card className="h-fit gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">Notas y créditos</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <GradesPanel grades={grades} average={avg.average} passedCredits={avg.passedCredits} pendingCredits={avg.pendingCredits} />
          </CardContent>
        </Card>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Los exámenes salen del{" "}
        <Link href="/study/schedule" className="underline underline-offset-2">
          horario
        </Link>
        ; los bloques se tachan solos con el{" "}
        <Link href="/study/focus" className="underline underline-offset-2">
          pomodoro
        </Link>
        .
      </p>
    </>
  );
}
