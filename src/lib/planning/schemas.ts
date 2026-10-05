import { z } from "zod";

import { isoDate } from "@/lib/dates";

export const cycleSchema = z
  .object({
    parentId: z.string().nullish(),
    level: z.enum(["MACRO", "MESO", "MICRO"]),
    phase: z.enum(["GENERAL_PREP", "SPECIFIC_PREP", "PRE_COMPETITION", "COMPETITION", "TAPER", "DELOAD", "TRANSITION"]).nullish(),
    name: z.string().trim().min(1).max(100),
    goal: z.string().max(500).nullish(),
    startDate: isoDate,
    endDate: isoDate,
    plannedLoad: z.number().min(0).max(20_000).nullish(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish(),
  })
  .refine((c) => c.endDate >= c.startDate, { message: "La fecha de fin debe ser posterior al inicio", path: ["endDate"] });

export const eventSchema = z.object({
  cycleId: z.string().nullish(),
  type: z.enum(["COMPETITION", "TEST_1RM", "TIME_TRIAL", "TAPER", "DELOAD", "STUDY_BLOCK", "EXAM", "OTHER"]),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullish(),
  startAt: isoDate,
  endAt: isoDate.nullish(),
  priority: z.enum(["A", "B", "C"]).nullish(),
  location: z.string().max(200).nullish(),
});

export const taskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullish(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  dueDate: isoDate.nullish(),
  tags: z.array(z.string().max(30)).max(10).default([]),
});

export const taskPatchSchema = taskSchema.partial().extend({
  status: z.enum(["TODO", "IN_PROGRESS", "DONE", "CANCELLED"]).optional(),
});
