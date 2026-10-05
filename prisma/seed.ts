// Catálogo global de ejercicios (userId = null). Idempotente: se puede relanzar.
import { config } from "dotenv";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient, type Prisma } from "../src/generated/prisma/client";

config({ path: [".env.local", ".env"], quiet: true });

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

type Ex = Omit<Prisma.ExerciseCreateManyInput, "userId">;

const exercises: Ex[] = [
  // Fuerza básica
  { name: "Sentadilla trasera", primaryMuscle: "QUADS", secondaryMuscles: ["GLUTES", "CORE"], pattern: "SQUAT", loadType: "BARBELL" },
  { name: "Sentadilla frontal", primaryMuscle: "QUADS", secondaryMuscles: ["CORE"], pattern: "SQUAT", loadType: "BARBELL" },
  { name: "Peso muerto", primaryMuscle: "HAMSTRINGS", secondaryMuscles: ["GLUTES", "BACK"], pattern: "HINGE", loadType: "BARBELL" },
  { name: "Peso muerto rumano", primaryMuscle: "HAMSTRINGS", secondaryMuscles: ["GLUTES"], pattern: "HINGE", loadType: "BARBELL" },
  { name: "Hip thrust", primaryMuscle: "GLUTES", secondaryMuscles: ["HAMSTRINGS"], pattern: "HINGE", loadType: "BARBELL" },
  { name: "Zancada búlgara", primaryMuscle: "QUADS", secondaryMuscles: ["GLUTES"], pattern: "LUNGE", loadType: "DUMBBELL", isUnilateral: true },
  { name: "Step-up", primaryMuscle: "QUADS", secondaryMuscles: ["GLUTES"], pattern: "LUNGE", loadType: "DUMBBELL", isUnilateral: true },
  { name: "Curl nórdico", primaryMuscle: "HAMSTRINGS", pattern: "ISOLATION", loadType: "BODYWEIGHT" },
  { name: "Elevación de gemelos", primaryMuscle: "CALVES", pattern: "ISOLATION", loadType: "MACHINE" },
  { name: "Press banca", primaryMuscle: "CHEST", secondaryMuscles: ["TRICEPS", "SHOULDERS"], pattern: "HORIZONTAL_PUSH", loadType: "BARBELL" },
  { name: "Press militar", primaryMuscle: "SHOULDERS", secondaryMuscles: ["TRICEPS"], pattern: "VERTICAL_PUSH", loadType: "BARBELL" },
  { name: "Press inclinado", primaryMuscle: "CHEST", secondaryMuscles: ["SHOULDERS"], pattern: "HORIZONTAL_PUSH", loadType: "BARBELL" },
  { name: "Dominadas", primaryMuscle: "BACK", secondaryMuscles: ["BICEPS"], pattern: "VERTICAL_PULL", loadType: "BODYWEIGHT", bodyweightFactor: 1 },
  { name: "Fondos en paralelas", primaryMuscle: "TRICEPS", secondaryMuscles: ["CHEST"], pattern: "VERTICAL_PUSH", loadType: "BODYWEIGHT", bodyweightFactor: 0.9 },
  { name: "Remo con barra", primaryMuscle: "BACK", secondaryMuscles: ["BICEPS"], pattern: "HORIZONTAL_PULL", loadType: "BARBELL" },
  { name: "Plancha", primaryMuscle: "CORE", pattern: "ISOLATION", loadType: "BODYWEIGHT" },
  // Halterofilia
  { name: "Cargada de potencia", primaryMuscle: "FULL_BODY", pattern: "OLYMPIC_LIFT", loadType: "BARBELL" },
  { name: "Arrancada de potencia", primaryMuscle: "FULL_BODY", pattern: "OLYMPIC_LIFT", loadType: "BARBELL" },
  { name: "Arrancada colgado", primaryMuscle: "FULL_BODY", pattern: "OLYMPIC_LIFT", loadType: "BARBELL" },
  { name: "Envión", primaryMuscle: "FULL_BODY", pattern: "OLYMPIC_LIFT", loadType: "BARBELL" },
  { name: "Push press", primaryMuscle: "SHOULDERS", secondaryMuscles: ["QUADS"], pattern: "VERTICAL_PUSH", loadType: "BARBELL" },
  // Específicos de lanzamientos (jabalina, peso, disco)
  { name: "Pullover con barra", primaryMuscle: "BACK", secondaryMuscles: ["CHEST", "CORE"], pattern: "ISOLATION", loadType: "BARBELL" },
  { name: "Lanzamiento balón medicinal por encima de la cabeza", primaryMuscle: "FULL_BODY", pattern: "PLYOMETRIC", loadType: "MEDBALL" },
  { name: "Lanzamiento balón medicinal rotacional", primaryMuscle: "CORE", pattern: "ROTATION", loadType: "MEDBALL" },
  { name: "Rotación en polea (woodchop)", primaryMuscle: "CORE", pattern: "ROTATION", loadType: "CABLE" },
  { name: "Rotación externa de hombro", primaryMuscle: "SHOULDERS", pattern: "ISOLATION", loadType: "BAND" },
  { name: "Lanzamiento de jabalina con balón lastrado", primaryMuscle: "FULL_BODY", pattern: "PLYOMETRIC", loadType: "MEDBALL" },
  // Pliometría / saltos
  { name: "Saltos al cajón", primaryMuscle: "QUADS", secondaryMuscles: ["GLUTES"], pattern: "PLYOMETRIC", loadType: "BODYWEIGHT" },
  { name: "Saltos de vallas", primaryMuscle: "CALVES", secondaryMuscles: ["QUADS"], pattern: "PLYOMETRIC", loadType: "BODYWEIGHT" },
  { name: "Multisaltos (bounding)", primaryMuscle: "GLUTES", secondaryMuscles: ["CALVES"], pattern: "PLYOMETRIC", loadType: "BODYWEIGHT" },
  { name: "Drop jump", primaryMuscle: "CALVES", secondaryMuscles: ["QUADS"], pattern: "PLYOMETRIC", loadType: "BODYWEIGHT" },
  { name: "Salto con contramovimiento (CMJ)", primaryMuscle: "QUADS", pattern: "PLYOMETRIC", loadType: "BODYWEIGHT" },
];

async function main() {
  let created = 0;
  for (const ex of exercises) {
    const exists = await prisma.exercise.findFirst({ where: { userId: null, name: ex.name } });
    if (!exists) {
      await prisma.exercise.create({ data: ex as Prisma.ExerciseCreateInput });
      created++;
    }
  }
  console.log(`Ejercicios globales: ${created} creados, ${exercises.length - created} ya existían`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
