import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { ManualDayEditor } from "@/components/planning/manual-plan";
import { pageUser } from "@/lib/auth/page";
import { formatDate } from "@/lib/format";
import type { PlanBlock } from "@/lib/planning/plan-import/types";
import { prisma } from "@/lib/prisma";
import { exerciseOptions } from "@/lib/training/session-queries";

export const metadata = { title: "Editar día · Atlenza" };

/** Editar un día de un plan propio. */
export default async function EditManualDayPage({ params }: PageProps<"/planning/plan/[id]/edit">) {
  const user = await pageUser();
  const { id } = await params;
  const d = await prisma.planDay.findFirst({ where: { id, userId: user.id }, include: { meso: { select: { code: true, source: true } } } });
  if (!d || d.meso.source !== "MANUAL") notFound();
  const blocks = d.content as PlanBlock[];
  const notes = blocks.filter((b) => b.kind === "text").map((b) => (b as { text: string }).text).join("\n\n");
  const rows = blocks.flatMap((b) => (b.kind === "table" ? b.rows : [])).map((r) => ({ exercise: r.exercise, sets: r.sets, load: r.load, rir: r.rir, rest: r.rest, how: r.how }));
  const exercises = await exerciseOptions(user.id);
  return (
    <>
      <PageHeader title={d.title} description={d.date ? formatDate(d.date, { weekday: "long", day: "numeric", month: "long" }) : ""} />
      <ManualDayEditor
        dayId={d.id}
        backHref={`/planning/meso/${d.meso.code}`}
        initial={{ title: d.title, durationMin: d.durationMin, type: d.type as "STRENGTH" | "TECHNICAL" | "TRACK" | "MIXED", notes, rows }}
        exercises={exercises.map((e) => e.name)}
      />
    </>
  );
}
