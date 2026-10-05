import { NextResponse } from "next/server";
import { z } from "zod";

import { parseBody, parseQuery, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { isoDate, toIsoDay, today } from "@/lib/dates";
import { createEntry, createEntrySchema, getDay } from "@/lib/nutrition/service";

export const GET = route(async (req) => {
  const user = await requireUser();
  const { date } = parseQuery(req, z.object({ date: isoDate.optional() }));
  return getDay(user.id, date ?? toIsoDay(today()));
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const entry = await createEntry(user.id, await parseBody(req, createEntrySchema));
  return NextResponse.json(entry, { status: 201 });
});
