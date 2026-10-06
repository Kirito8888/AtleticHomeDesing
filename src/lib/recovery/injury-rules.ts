// Etiquetas y reglas de aviso de lesiones (puro, compartido con la UI).

export const BODY_AREA_LABEL = {
  HEAD_NECK: "Cabeza / cuello",
  SHOULDER: "Hombro",
  ELBOW: "Codo",
  WRIST_HAND: "Muñeca / mano",
  CHEST: "Pecho",
  UPPER_BACK: "Espalda alta",
  LOWER_BACK: "Zona lumbar",
  ABDOMEN: "Abdomen",
  HIP_GROIN: "Cadera / ingle",
  GLUTE: "Glúteo",
  HAMSTRING: "Isquiotibiales",
  QUADRICEPS: "Cuádriceps",
  KNEE: "Rodilla",
  CALF: "Gemelo",
  ACHILLES: "Aquiles",
  ANKLE: "Tobillo",
  FOOT: "Pie",
  OTHER: "Otra",
} as const;

export type BodyAreaName = keyof typeof BODY_AREA_LABEL;

export const BODY_SIDE_LABEL = { LEFT: "izquierda", RIGHT: "derecha", BOTH: "ambos lados" } as const;

export interface ActiveInjury {
  area: BodyAreaName;
  side: keyof typeof BODY_SIDE_LABEL | null;
  pain: number;
  limitsTraining: boolean;
}

export const injuryName = (i: Pick<ActiveInjury, "area" | "side">) =>
  `${BODY_AREA_LABEL[i.area]}${i.side ? ` (${BODY_SIDE_LABEL[i.side]})` : ""}`;

/**
 * Aviso del panel: hay molestias activas y la carga sube deprisa (ACWR > 1,3) o el
 * dolor es alto. Orientativo, no diagnóstico.
 */
export function injuryAlert(active: ActiveInjury[], acwr: number | null): { level: "warn" | "info"; message: string } | null {
  if (!active.length) return null;
  const worst = active.reduce((a, b) => (b.pain > a.pain ? b : a));
  const where = injuryName(worst);
  if (acwr != null && acwr > 1.3) {
    return {
      level: "warn",
      message: `Molestia activa en ${where} (dolor ${worst.pain}/10) y la carga aguda supera a la crónica (ACWR ${acwr.toFixed(2).replace(".", ",")}). Considera reducir el volumen esta semana.`,
    };
  }
  if (worst.pain >= 6 || worst.limitsTraining) {
    return { level: "warn", message: `Molestia activa en ${where} (dolor ${worst.pain}/10). Si persiste o empeora, consulta a un profesional sanitario.` };
  }
  return { level: "info", message: `${active.length === 1 ? "Molestia activa" : `${active.length} molestias activas`}: ${active.map(injuryName).join(", ")}.` };
}
