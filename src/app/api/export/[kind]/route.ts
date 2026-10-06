import { ApiError, enforceRateLimit, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { auditContext, recordEvent } from "@/lib/security/audit";
import { csvResponse, toCsv } from "@/lib/csv";
import { today, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

async function trainingCsv(userId: string) {
  const sessions = await prisma.trainingSession.findMany({
    where: { userId },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    include: {
      track: { select: { modality: true, distanceM: true, movingTimeSec: true, hrAvg: true } },
      technical: { select: { event: true, implementWeightG: true, bestMarkM: true } },
      strength: { select: { tonnageKg: true } },
    },
  });
  return toCsv(
    ["fecha", "tipo", "disciplina", "estado", "titulo", "duracion_min", "rpe", "tss", "metodo_tss", "modalidad", "distancia_m", "tiempo_s", "fc_media", "prueba", "artefacto_g", "mejor_marca_m", "tonelaje_kg", "notas"],
    sessions.map((s) => [
      s.date,
      s.type,
      s.discipline,
      s.status,
      s.title,
      s.durationSec != null ? Math.round(s.durationSec / 6) / 10 : null,
      s.sessionRpe,
      s.tss,
      s.tssMethod,
      s.track?.modality,
      s.track?.distanceM,
      s.track?.movingTimeSec,
      s.track?.hrAvg,
      s.technical?.event,
      s.technical?.implementWeightG,
      s.technical?.bestMarkM,
      s.strength?.tonnageKg,
      s.notes,
    ]),
  );
}

/** Una fila por apunte contable (partida doble): importe + débito / − crédito. */
async function financeCsv(userId: string) {
  const postings = await prisma.posting.findMany({
    where: { transaction: { userId } },
    orderBy: [{ transaction: { date: "asc" } }, { transactionId: "asc" }],
    include: {
      transaction: { select: { id: true, date: true, kind: true, description: true, payee: true } },
      account: { select: { name: true, type: true } },
      category: { select: { name: true } },
    },
  });
  return toCsv(
    ["fecha", "movimiento", "tipo", "descripcion", "beneficiario", "cuenta", "tipo_cuenta", "categoria", "importe_eur", "nota"],
    postings.map((p) => [
      p.transaction.date,
      p.transaction.id,
      p.transaction.kind,
      p.transaction.description,
      p.transaction.payee,
      p.account.name,
      p.account.type,
      p.category?.name,
      p.amountCents / 100,
      p.memo,
    ]),
  );
}

const EXPORTS = { training: trainingCsv, finance: financeCsv } as const;

/** GET /api/export/training | /api/export/finance → CSV (Excel/LibreOffice). */
export const GET = route(async (req, ctx: RouteContext<"/api/export/[kind]">) => {
  const user = await requireUser();
  const { kind } = await ctx.params;
  if (!(kind in EXPORTS)) throw new ApiError(404, "Exportación desconocida");
  enforceRateLimit("export", user.id);
  const body = await EXPORTS[kind as keyof typeof EXPORTS](user.id);
  await recordEvent(user.id, "DATA_EXPORTED", auditContext(req.headers), `CSV ${kind}`);
  return csvResponse(`lifeos-${kind === "training" ? "entrenos" : "finanzas"}-${toIsoDay(today())}.csv`, body);
});
