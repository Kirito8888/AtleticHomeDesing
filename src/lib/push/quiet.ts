// v1.8 · Horas de silencio: las notificaciones normales no suenan; las de seguridad y las de
// «entreno sola» (y los inicios de sesión) llegan siempre. Puro.
const URGENT = /^(sec-|safety-|login|snooze-urgent)/;

export const isUrgent = (tag: string | undefined) => Boolean(tag && URGENT.test(tag));

/** ¿Está `now` (hora de Madrid) dentro del tramo [from, to)? El tramo puede cruzar la medianoche. */
export function inQuietHours(now: Date, q: { from: string; to: string } | null, timeZone = "Europe/Madrid") {
  if (!q) return false;
  const hm = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  const m = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const t = m(hm);
  const from = m(q.from);
  const to = m(q.to);
  if (from === to) return false;
  return from < to ? t >= from && t < to : t >= from || t < to;
}
