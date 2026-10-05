import { NextResponse } from "next/server";
import { z } from "zod";

import { parseBody, parseQuery, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { dateOnly } from "@/lib/dates";
import { taskSchema } from "@/lib/planning/schemas";
import { prisma } from "@/lib/prisma";

const PRIORITY_ORDER = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;

/** Tareas abiertas por defecto, ordenadas por prioridad y fecha límite. */
export const GET = route(async (req) => {
  const user = await requireUser();
  const q = parseQuery(req, z.object({ status: z.enum(["open", "done", "all"]).default("open") }));
  const tasks = await prisma.task.findMany({
    where: {
      userId: user.id,
      status: q.status === "open" ? { in: ["TODO", "IN_PROGRESS"] } : q.status === "done" ? "DONE" : undefined,
    },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take: 200,
  });
  return tasks.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const data = await parseBody(req, taskSchema);
  const task = await prisma.task.create({
    data: { ...data, userId: user.id, dueDate: data.dueDate ? dateOnly(data.dueDate) : null },
  });
  return NextResponse.json(task, { status: 201 });
});
