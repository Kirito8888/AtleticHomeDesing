import { NextResponse } from "next/server";
import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser, resolveAthleteId } from "@/lib/auth/session";
import { DESCRIPTION_MAX, listLibrary } from "@/lib/training/exercise-library";
import { prisma } from "@/lib/prisma";

/** Catálogo: ejercicios globales + los propios. Con `?athlete=` la entrenadora ve los de su atleta (solo lectura). */
export const GET = route(async (req) => {
  const user = await requireUser();
  const ownerId = await resolveAthleteId(user, req.nextUrl.searchParams.get("athlete"), "SESSIONS");
  return listLibrary(ownerId, req.nextUrl.searchParams.get("q")?.trim());
});

const muscle = z.enum([
  "CHEST",
  "BACK",
  "SHOULDERS",
  "BICEPS",
  "TRICEPS",
  "FOREARMS",
  "CORE",
  "QUADS",
  "HAMSTRINGS",
  "GLUTES",
  "CALVES",
  "FULL_BODY",
]);

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  primaryMuscle: muscle.nullish(),
  secondaryMuscles: z.array(muscle).default([]),
  pattern: z
    .enum([
      "SQUAT",
      "HINGE",
      "LUNGE",
      "HORIZONTAL_PUSH",
      "VERTICAL_PUSH",
      "HORIZONTAL_PULL",
      "VERTICAL_PULL",
      "CARRY",
      "ROTATION",
      "OLYMPIC_LIFT",
      "PLYOMETRIC",
      "ISOLATION",
    ])
    .nullish(),
  loadType: z.enum(["BARBELL", "DUMBBELL", "KETTLEBELL", "MACHINE", "CABLE", "BODYWEIGHT", "MEDBALL", "BAND", "OTHER"]).default("BARBELL"),
  isUnilateral: z.boolean().default(false),
  bodyweightFactor: z.number().min(0).max(1.5).default(0),
  description: z.string().trim().max(DESCRIPTION_MAX).nullish(),
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const data = await parseBody(req, schema);
  const exercise = await prisma.exercise.create({ data: { ...data, userId: user.id } });
  return NextResponse.json(exercise, { status: 201 });
});
