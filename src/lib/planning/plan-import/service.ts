import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api";
import { addDays, dateOnly, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

import type { ParsedUpload } from "./files";
import { isActiveVariant, phaseFor, seasonName, stableJson } from "./rules";
import type { ParsedDay, ParsedMeso, ParsedWeek, PlanBlock, VariantOption } from "./types";

type Tx = Prisma.TransactionClient;

/** Huella de un día para saber si cambió entre dos versiones del PDF. */
function fingerprint(d: {
  variant: string | null;
  week: number | null;
  code: string;
  date: string | null;
  relDay: number | null;
  title: string;
  durationMin: number | null;
  competition: boolean;
  type: string;
  weekTitle: string | null;
  blocks: unknown;
}) {
  return stableJson([d.variant, d.week, d.code, d.date, d.relDay, d.title, d.durationMin, d.competition, d.type, d.weekTitle, d.blocks]);
}

type StoredDay = Prisma.PlanDayGetPayload<object>;
const storedFingerprint = (d: StoredDay) => fingerprint({ ...d, date: d.date ? toIsoDay(d.date) : null, blocks: d.content });

const rowsOf = (blocks: PlanBlock[]) => blocks.flatMap((b) => (b.kind === "table" ? b.rows : []));

/** Vista previa: qué se crearía, cambiaría o borraría, sin tocar nada. */
export async function previewPlanImport(userId: string, upload: ParsedUpload) {
  const codes = upload.mesos.map((m) => m.code);
  const [stored, storedMesos] = await Promise.all([
    prisma.planDay.findMany({ where: { userId, meso: { code: { in: codes } } }, include: { meso: { select: { code: true } } } }),
    prisma.planMeso.findMany({ where: { userId, code: { in: codes } }, select: { code: true, variant: true } }),
  ]);
  const doneIds = new Set(
    (
      await prisma.trainingSession.findMany({
        where: { userId, id: { in: stored.flatMap((d) => (d.sessionId ? [d.sessionId] : [])) }, status: { not: "PLANNED" } },
        select: { id: true },
      })
    ).map((s) => s.id),
  );
  const byKey = new Map(stored.map((d) => [d.key, d]));

  const mesos = upload.mesos.map((m) => {
    const keys = new Set(m.days.map((d) => d.key));
    let created = 0;
    let changed = 0;
    let unchanged = 0;
    let keptDone = 0;
    for (const d of m.days) {
      const old = byKey.get(d.key);
      if (!old) created++;
      else if (storedFingerprint(old) === fingerprint(d)) unchanged++;
      else if (old.sessionId && doneIds.has(old.sessionId)) keptDone++;
      else changed++;
    }
    const removed = stored.filter((d) => d.meso.code === m.code && !keys.has(d.key)).length;
    const rows = m.days.flatMap((d) => rowsOf(d.blocks));
    return {
      code: m.code,
      name: m.name,
      start: m.start,
      end: m.end,
      version: m.version,
      days: m.days.length,
      weeks: m.weeks.length,
      exercises: rows.filter((r) => !r.ramp).length,
      competitions: m.days.filter((d) => d.competition).map((d) => ({ date: d.date, relDay: d.relDay, title: d.title, variant: d.variant })),
      variants: m.variants,
      defaultVariant: m.defaultVariant,
      currentVariant: storedMesos.find((s) => s.code === m.code)?.variant ?? null,
      warnings: m.warnings,
      diff: { created, changed, unchanged, removed, keptDone },
    };
  });
  return { mesos, skipped: upload.skipped, totalDays: mesos.reduce((a, m) => a + m.days, 0) };
}

/**
 * Importa (o reimporta) los bloques. Reimportar una versión nueva del PDF
 * actualiza los días y las sesiones que siguen planificadas; las sesiones ya
 * hechas u omitidas no se tocan.
 */
export async function commitPlanImport(userId: string, upload: ParsedUpload) {
  if (!upload.mesos.length) throw new ApiError(400, "No hay ningún PDF «día a día» que importar.");
  const totals = { days: 0, sessionsCreated: 0, sessionsUpdated: 0, sessionsRemoved: 0, keptDone: 0, events: 0, removedDays: 0 };
  for (const m of upload.mesos) {
    const r = await prisma.$transaction((tx) => importMeso(tx, userId, m), { timeout: 120_000, maxWait: 10_000 });
    for (const k of Object.keys(totals) as Array<keyof typeof totals>) totals[k] += r[k];
  }
  return { mesos: upload.mesos.map((m) => m.code), ...totals, skipped: upload.skipped };
}

async function importMeso(tx: Tx, userId: string, m: ParsedMeso) {
  const start = dateOnly(m.start);
  const end = dateOnly(m.end);

  // Macrociclo de la temporada: se crea una vez y se estira con cada bloque.
  const seasonTitle = seasonName(m.start);
  let macro = await tx.trainingCycle.findFirst({ where: { userId, level: "MACRO", name: seasonTitle } });
  if (!macro) macro = await tx.trainingCycle.create({ data: { userId, level: "MACRO", name: seasonTitle, startDate: start, endDate: end } });
  else if (macro.startDate > start || macro.endDate < end) {
    macro = await tx.trainingCycle.update({
      where: { id: macro.id },
      data: { startDate: macro.startDate < start ? macro.startDate : start, endDate: macro.endDate > end ? macro.endDate : end },
    });
  }

  const prev = await tx.planMeso.findUnique({ where: { userId_code: { userId, code: m.code } } });
  const cycleData = { parentId: macro.id, level: "MESO" as const, name: `${m.code} · ${m.name}`.slice(0, 120), phase: phaseFor(m.name), startDate: start, endDate: end };
  const prevCycle = prev?.cycleId ? await tx.trainingCycle.findFirst({ where: { id: prev.cycleId, userId } }) : null;
  const cycle = prevCycle
    ? await tx.trainingCycle.update({ where: { id: prevCycle.id }, data: cycleData })
    : await tx.trainingCycle.create({ data: { userId, ...cycleData } });

  const leaves = m.variants.map((v) => v.code);
  const variant = prev?.variant && leaves.includes(prev.variant) ? prev.variant : m.defaultVariant;
  const mesoData = {
    name: m.name,
    startDate: start,
    endDate: end,
    version: m.version,
    intro: m.intro as Prisma.InputJsonValue,
    annexes: m.annexes as Prisma.InputJsonValue,
    weeks: m.weeks as Prisma.InputJsonValue,
    variants: m.variants as Prisma.InputJsonValue,
    variant,
    cycleId: cycle.id,
  };
  const meso = prev
    ? await tx.planMeso.update({ where: { id: prev.id }, data: mesoData })
    : await tx.planMeso.create({ data: { userId, code: m.code, ...mesoData } });

  // Días: alta o actualización por clave; los que ya no están en el PDF se retiran.
  const existing = await tx.planDay.findMany({ where: { mesoId: meso.id } });
  const keys = new Set(m.days.map((d) => d.key));
  const gone = existing.filter((d) => !keys.has(d.key));
  let removedSessions = 0;
  for (const d of gone) removedSessions += await detach(tx, userId, d);
  if (gone.length) await tx.planDay.deleteMany({ where: { id: { in: gone.map((d) => d.id) } } });
  const byKey = new Map(existing.map((d) => [d.key, d]));
  for (const d of m.days) {
    const data = dayData(d);
    const old = byKey.get(d.key);
    if (!old) await tx.planDay.create({ data: { userId, mesoId: meso.id, key: d.key, ...data } });
    else if (storedFingerprint(old) !== fingerprint(d)) await tx.planDay.update({ where: { id: old.id }, data });
  }

  const r = await materialize(tx, userId, meso.id);
  return { ...r, days: m.days.length, removedDays: gone.length, sessionsRemoved: r.sessionsRemoved + removedSessions };
}

function dayData(d: ParsedDay) {
  return {
    variant: d.variant,
    week: d.week,
    code: d.code,
    date: d.date ? dateOnly(d.date) : null,
    relDay: d.relDay,
    title: d.title,
    durationMin: d.durationMin,
    competition: d.competition,
    type: d.type,
    weekTitle: d.weekTitle,
    content: d.blocks as Prisma.InputJsonValue,
  };
}

/** Quita del calendario lo que creó un día: su sesión si sigue planificada y su competición. */
async function detach(tx: Tx, userId: string, d: { sessionId: string | null; eventId: string | null }): Promise<number> {
  let removed = 0;
  if (d.sessionId) removed = (await tx.trainingSession.deleteMany({ where: { id: d.sessionId, userId, status: "PLANNED" } })).count;
  if (d.eventId) await tx.calendarEvent.deleteMany({ where: { id: d.eventId, userId } });
  return removed;
}

/**
 * Sincroniza las sesiones PLANNED, las competiciones y los microciclos con la
 * versión elegida: crea las que faltan, actualiza las planificadas y retira las
 * de versiones no activas. Las sesiones hechas u omitidas nunca se tocan.
 */
async function materialize(tx: Tx, userId: string, mesoId: string) {
  const meso = await tx.planMeso.findUniqueOrThrow({ where: { id: mesoId }, include: { days: { orderBy: { key: "asc" } } } });
  const r = { sessionsCreated: 0, sessionsUpdated: 0, sessionsRemoved: 0, keptDone: 0, events: 0 };

  // Microciclos: uno por semana activa (se rehacen; las sesiones se vuelven a enlazar abajo).
  const micro = new Map<string, string>();
  // El usuario pudo borrar el mesociclo a mano: entonces las sesiones quedan sin ciclo.
  const mesoCycleId = meso.cycleId && (await tx.trainingCycle.count({ where: { id: meso.cycleId, userId } })) ? meso.cycleId : null;
  if (mesoCycleId) {
    await tx.trainingCycle.deleteMany({ where: { userId, parentId: mesoCycleId, level: "MICRO" } });
    for (const w of meso.weeks as ParsedWeek[]) {
      if (!isActiveVariant(w.variant, meso.variant) || w.number == null || !w.start || !w.end) continue;
      const c = await tx.trainingCycle.create({
        data: {
          userId,
          parentId: mesoCycleId,
          level: "MICRO",
          name: `${meso.code} · S${w.number}${w.title ? ` · ${w.title}` : ""}`.slice(0, 120),
          startDate: dateOnly(w.start),
          endDate: dateOnly(w.end),
        },
      });
      micro.set(`${w.variant ?? "-"}|${w.number}`, c.id);
    }
  }

  const ids = meso.days.flatMap((d) => (d.sessionId ? [d.sessionId] : []));
  const sessions = new Map(
    (await tx.trainingSession.findMany({ where: { userId, id: { in: ids } }, select: { id: true, status: true } })).map((s) => [s.id, s.status]),
  );
  const eventIds = meso.days.flatMap((d) => (d.eventId ? [d.eventId] : []));
  const events = new Set((await tx.calendarEvent.findMany({ where: { userId, id: { in: eventIds } }, select: { id: true } })).map((e) => e.id));

  for (const d of meso.days) {
    const active = isActiveVariant(d.variant, meso.variant);
    const date = d.date ?? (d.relDay != null && meso.anchorDate ? addDays(meso.anchorDate, d.relDay) : null);
    const status = d.sessionId ? sessions.get(d.sessionId) : undefined;
    let sessionId = status ? d.sessionId : null;
    let eventId = d.eventId && events.has(d.eventId) ? d.eventId : null;
    const cycleId = (d.week != null ? (micro.get(`${d.variant ?? "-"}|${d.week}`) ?? micro.get(`${d.variant?.split("-")[0] ?? "-"}|${d.week}`)) : undefined) ?? mesoCycleId;

    if (active && date) {
      const data = { date, title: d.title, type: d.type, durationSec: d.durationMin ? d.durationMin * 60 : null, cycleId };
      if (!status) {
        sessionId = (await tx.trainingSession.create({ data: { userId, status: "PLANNED", ...data }, select: { id: true } })).id;
        r.sessionsCreated++;
      } else if (status === "PLANNED") {
        await tx.trainingSession.update({ where: { id: sessionId! }, data });
        r.sessionsUpdated++;
      } else {
        await tx.trainingSession.update({ where: { id: sessionId! }, data: { cycleId } });
        r.keptDone++;
      }
      if (d.competition) {
        const ev = { title: d.title.slice(0, 200), startAt: date, allDay: true, cycleId: mesoCycleId, description: `Del plan importado (${meso.code}).` };
        if (eventId) await tx.calendarEvent.update({ where: { id: eventId }, data: ev });
        else eventId = (await tx.calendarEvent.create({ data: { userId, type: "COMPETITION", ...ev }, select: { id: true } })).id;
        r.events++;
      } else if (eventId) {
        await tx.calendarEvent.delete({ where: { id: eventId } });
        eventId = null;
      }
    } else {
      if (status === "PLANNED") {
        await tx.trainingSession.delete({ where: { id: sessionId! } });
        sessionId = null;
        r.sessionsRemoved++;
      } else if (status) r.keptDone++;
      if (eventId) {
        await tx.calendarEvent.delete({ where: { id: eventId } });
        eventId = null;
      }
    }
    if (sessionId !== d.sessionId || eventId !== d.eventId) await tx.planDay.update({ where: { id: d.id }, data: { sessionId, eventId } });
  }
  return r;
}

/** Cambia la versión activa de un bloque (A/B, día de competición, «Si me clasifico»). */
export async function setPlanVariant(userId: string, code: string, variant: string, anchorDate?: string | null) {
  const meso = await prisma.planMeso.findUnique({ where: { userId_code: { userId, code } }, include: { days: { select: { variant: true, relDay: true } } } });
  if (!meso) throw new ApiError(404, "Bloque no encontrado");
  const options = meso.variants as VariantOption[];
  if (!options.some((o) => o.code === variant)) throw new ApiError(400, "Esa versión no existe en este bloque");
  const anchor = anchorDate ? dateOnly(anchorDate) : meso.anchorDate;
  const needsAnchor = meso.days.some((d) => d.relDay != null && isActiveVariant(d.variant, variant));
  if (needsAnchor && !anchor) throw new ApiError(400, "Esta versión cuenta los días hacia atrás desde la competición: indica su fecha.");
  return prisma.$transaction(
    async (tx) => {
      await tx.planMeso.update({ where: { id: meso.id }, data: { variant, anchorDate: anchor } });
      return materialize(tx, userId, meso.id);
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}

/** Borra un bloque importado: sus sesiones planificadas, competiciones y ciclos. Las hechas se quedan. */
export async function deletePlanMeso(userId: string, code: string) {
  const meso = await prisma.planMeso.findUnique({ where: { userId_code: { userId, code } }, include: { days: { select: { sessionId: true, eventId: true } } } });
  if (!meso) throw new ApiError(404, "Bloque no encontrado");
  return prisma.$transaction(
    async (tx) => {
      let removed = 0;
      for (const d of meso.days) removed += await detach(tx, userId, d);
      if (meso.cycleId) await tx.trainingCycle.deleteMany({ where: { id: meso.cycleId, userId } });
      await tx.planMeso.delete({ where: { id: meso.id } });
      return { sessionsRemoved: removed };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}

/** Bloques importados con sus versiones, para la tarjeta de Planificación. */
export async function planOverview(userId: string) {
  const mesos = await prisma.planMeso.findMany({
    where: { userId },
    orderBy: { startDate: "asc" },
    select: { id: true, code: true, name: true, startDate: true, endDate: true, version: true, variants: true, variant: true, anchorDate: true, _count: { select: { days: true } } },
  });
  // Versiones con días relativos a la competición (D−5…D): piden la fecha al elegirlas.
  const relative = await prisma.planDay.groupBy({ by: ["mesoId", "variant"], where: { userId, relDay: { not: null } } });
  return mesos.map((m) => {
    const relVariants = relative.filter((g) => g.mesoId === m.id).map((g) => g.variant);
    return {
      code: m.code,
      name: m.name,
      start: toIsoDay(m.startDate),
      end: toIsoDay(m.endDate),
      version: m.version,
      days: m._count.days,
      variant: m.variant,
      anchorDate: m.anchorDate ? toIsoDay(m.anchorDate) : null,
      variants: (m.variants as VariantOption[]).map((v) => ({ ...v, needsAnchor: relVariants.some((rv) => isActiveVariant(rv, v.code)) })),
    };
  });
}

/** Día del plan enlazado a una sesión (para el detalle de la sesión). */
export function planDayForSession(userId: string, sessionId: string) {
  return prisma.planDay.findFirst({ where: { userId, sessionId }, include: { meso: { select: { code: true, name: true, variants: true } } } });
}
