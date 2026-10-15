import { z } from "zod";

import { isoDate } from "@/lib/dates";
import { disciplineEnum, eventKeyEnum } from "@/lib/training/schemas";

/** Campos del perfil de atleta (nombre aparte): los comparten `PATCH /api/profile` y «Restaurar exportación». */
export const profileSchema = z.object({
  birthDate: isoDate.nullish(),
  sex: z.enum(["MALE", "FEMALE", "OTHER"]).nullish(),
  heightCm: z.number().min(100).max(250).nullish(),
  bodyWeightKg: z.number().min(20).max(300).nullish(),
  primaryDiscipline: disciplineEnum.nullish(),
  primaryEvent: eventKeyEnum.nullish(),
  disciplines: z.array(disciplineEnum).max(11).optional(),
  ctlTimeConstant: z.number().int().min(14).max(90).optional(),
  atlTimeConstant: z.number().int().min(3).max(21).optional(),
});
