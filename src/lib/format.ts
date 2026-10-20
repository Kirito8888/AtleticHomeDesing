// Formateadores de presentación (es-ES). Sin dependencias de servidor.

const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const num1 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });
const num2 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });

/** Zona horaria de toda la presentación (instantes y horas). Los días de calendario van en UTC (`formatDate`). */
export const TZ = "Europe/Madrid";

const int0 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
const decFmt = new Map<number, Intl.NumberFormat>();
/** Decimales fijos con coma: formatDec(7.5, 1) → "7,5"; formatDec(1234.5, 2) → "1234,50" (sin separador de miles en cifras cortas, como es-ES). */
export function formatDec(n: number | null | undefined, decimals: number): string {
  if (n == null || !Number.isFinite(n)) return "—";
  let f = decFmt.get(decimals);
  if (!f) decFmt.set(decimals, (f = new Intl.NumberFormat("es-ES", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })));
  return f.format(n);
}
/** Entero con separador de miles: 12345 → "12.345". */
export const formatInt = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : int0.format(Math.round(n)));
/** Importe en cualquier moneda (céntimos). */
export const formatMoney = (cents: number, currency = "EUR") => new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(cents / 100);
/** 1572864 → "1,5 MB"; 2048 → "2 KB". */
export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${formatInt(Math.max(1, n / 1024))} KB`;
  if (n < 1024 ** 3) return `${formatNum(n / 1024 ** 2)} MB`;
  return `${formatNum(n / 1024 ** 3)} GB`;
}

export const formatEur = (cents: number) => eur.format(cents / 100);
export const formatNum = (n: number | null | undefined, decimals: 1 | 2 = 1) =>
  n == null ? "—" : (decimals === 1 ? num1 : num2).format(n);

/** 3725 → "1:02:05"; 95 → "1:35" */
export function formatDuration(totalSec: number | null | undefined): string {
  if (totalSec == null) return "—";
  const s = Math.round(totalSec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

/** Ritmo s/km → "4:05 /km" */
export const formatPace = (secPerKm: number | null | undefined, unit = "/km") =>
  secPerKm == null ? "—" : `${formatDuration(secPerKm)} ${unit}`;

/** "1:02:05" | "62:05" | "45.3" (segundos con décimas) → segundos */
export function parseDuration(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (!t) return null;
  const parts = t.split(":").map(Number);
  if (parts.some((p) => Number.isNaN(p) || p < 0)) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

export function formatDate(iso: string | Date, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) {
  const d = typeof iso === "string" ? new Date(`${iso.slice(0, 10)}T00:00:00Z`) : iso;
  return new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", ...opts }).format(d);
}

/** Instante → fecha (y hora si se pide) en la zona fija. Por defecto "5 oct 2026". */
export function formatDateTime(instant: string | Date, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  return new Intl.DateTimeFormat("es-ES", { timeZone: TZ, ...opts }).format(typeof instant === "string" ? new Date(instant) : instant);
}
/** Instante → "14:05" en la zona fija. */
export const formatTime = (instant: string | Date) => formatDateTime(instant, { hour: "2-digit", minute: "2-digit" });
/** "2026-10" → "oct" | "octubre de 2026". */
export function formatMonth(yyyyMm: string, style: "short" | "long" = "short"): string {
  return formatDate(`${yyyyMm}-01`, style === "short" ? { month: "short" } : { month: "long", year: "numeric" });
}

export const SESSION_TYPE_LABEL = {
  TRACK: "Pista / cardio",
  TECHNICAL: "Técnica",
  STRENGTH: "Fuerza",
  MIXED: "Mixta",
} as const;

export const TECHNICAL_EVENT_LABEL: Record<string, string> = {
  JAVELIN: "Jabalina",
  SHOT_PUT: "Peso",
  DISCUS: "Disco",
  HAMMER: "Martillo",
  WEIGHT_THROW: "Lanzamiento de peso pesado",
  LONG_JUMP: "Longitud",
  TRIPLE_JUMP: "Triple salto",
  HIGH_JUMP: "Altura",
  POLE_VAULT: "Pértiga",
  OTHER: "Pelota u otro implemento",
};

export const READINESS_LABEL = { READY: "Listo", MODERATE: "Moderado", RECOVER: "Recuperar" } as const;

/** "octubre de 2026" → "Octubre de 2026" (CSS `capitalize` pondría "De" en mayúscula). */
export const capitalizeFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
