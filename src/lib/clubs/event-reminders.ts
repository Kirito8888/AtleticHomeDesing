// v3.2 Q · Recordatorios de asistencia (V3-N04 parte B). Puro: sin BD.
// Solo logística: título del evento, club, fecha y hora. Nunca importe, nombres de otras personas ni datos de salud.
import { formatDateTime } from "@/lib/format";

const HOUR = 3600e3;

/** El recordatorio se manda entre 72 h y 2 h antes del evento… */
export const REMIND_FROM_H = 72;
export const REMIND_UNTIL_H = 2;
/** …si el evento existe desde hace al menos 6 h (da margen a responder sin aviso). */
export const MIN_AGE_H = 6;
/** Franja horaria de Madrid en la que se avisa (para todas; así una menor nunca recibe un aviso de noche). */
export const SEND_FROM_HOUR = 9;
export const SEND_UNTIL_HOUR = 21;
/** Topes: trabajos encolados por pasada y recordatorios de eventos por persona y día. */
export const MAX_JOBS_PER_RUN = 200;
export const MAX_PER_USER_DAY = 3;
/** El resumen al staff sale cuando faltan ≤ 24 h. */
export const SUMMARY_BEFORE_H = 24;

export const reminderKey = (eventId: string, memberId: string) => `event-rsvp:${eventId}:${memberId}`;
export const reminderKeyPrefix = (eventId: string) => `event-rsvp:${eventId}:`;
export const summaryKey = (eventId: string, userId: string) => `event-summary:${eventId}:${userId}`;

/** Hora (0–23) de Madrid. */
export const madridHourOf = (now: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", hourCycle: "h23" }).format(now));

export const inSendHours = (now: Date) => {
  const h = madridHourOf(now);
  return h >= SEND_FROM_HOUR && h < SEND_UNTIL_HOUR;
};

/** Límites [desde, hasta] de `startsAt` para los eventos que tocan ahora. */
export const reminderWindow = (now: Date) => ({ from: new Date(now.getTime() + REMIND_UNTIL_H * HOUR), to: new Date(now.getTime() + REMIND_FROM_H * HOUR) });

/** ¿Toca recordar este evento ahora? (sin contar la franja horaria ni las horas de silencio de cada persona). */
export function reminderDue(ev: { startsAt: Date; createdAt: Date }, now: Date): boolean {
  const w = reminderWindow(now);
  return ev.startsAt >= w.from && ev.startsAt <= w.to && now.getTime() - ev.createdAt.getTime() >= MIN_AGE_H * HOUR;
}

export function reminderText(club: { id: string; name: string }, ev: { id: string; title: string; startsAt: Date }) {
  const when = formatDateTime(ev.startsAt, { day: "2-digit", month: "2-digit" });
  const hour = formatDateTime(ev.startsAt, { hour: "2-digit", minute: "2-digit" });
  return {
    title: `${club.name} · asistencia`.slice(0, 120),
    body: `¿Vas a «${ev.title}» el ${when} a las ${hour}? Responde en un toque.`,
    url: `/clubs/${club.id}`,
    tag: `event-rsvp-${ev.id}`,
  };
}

/** Resumen al staff: solo recuentos (los nombres se ven dentro de la app). */
export function summaryText(club: { id: string; name: string }, ev: { id: string; title: string }, c: { yes: number; no: number; maybe: number; none: number }) {
  return {
    title: `${club.name} · resumen`.slice(0, 120),
    body: `«${ev.title}»: ${c.yes} sí, ${c.no} no, ${c.maybe} quizá, ${c.none} sin responder.`,
    url: `/clubs/${club.id}`,
    tag: `event-summary-${ev.id}`,
  };
}
