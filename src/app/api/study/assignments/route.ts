import { NextResponse } from "next/server";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { today, toIsoDay } from "@/lib/dates";
import { assignmentSchema } from "@/lib/study/coursework";
import { assignmentsView, createAssignment } from "@/lib/study/coursework-service";

/** v1.7 · Trabajos y entregas. */
export const GET = route(async () => {
  const user = await requireUser();
  return assignmentsView(user.id, toIsoDay(today()));
});

export const POST = route(async (req) => {
  const user = await requireUser();
  return NextResponse.json(await createAssignment(user.id, await parseBody(req, assignmentSchema)), { status: 201 });
});
