// Formateadores de presentación (es-ES). Sin dependencias de servidor.

const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const num1 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });
const num2 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });

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
  OTHER: "Otro",
};

export const READINESS_LABEL = { READY: "Listo", MODERATE: "Moderado", RECOVER: "Recuperar" } as const;
