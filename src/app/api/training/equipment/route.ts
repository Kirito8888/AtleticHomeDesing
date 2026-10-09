import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { today, toIsoDay } from "@/lib/dates";
import { equipmentSchema } from "@/lib/training/equipment";
import { createEquipment, listEquipment } from "@/lib/training/equipment-service";

/** Inventario de material con su desgaste · alta. */
export const GET = route(async () => {
  const user = await requireUser();
  return listEquipment(user.id, toIsoDay(today()));
});

export const POST = route(async (req) => {
  const user = await requireUser();
  return createEquipment(user.id, await parseBody(req, equipmentSchema));
});
