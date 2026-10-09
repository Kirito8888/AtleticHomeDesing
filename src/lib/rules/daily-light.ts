// Semáforo del día (v1.6): una recomendación con su porqué. Puro. Pautas de prudencia, no diagnóstico.
export type LightInput = {
  readiness: number | null;
  hooper: number | null;
  maxPain: number | null;
  protocolPhase: string | null;
  zoneFatigue: { zone: string; value: number } | null;
  cycleSuggestion: string | null;
};
export type LightPrefs = { lightReadinessAmber: number; lightReadinessRed: number; lightHooperAmber: number; lightHooperRed: number; lightPainRed: number; lightZoneAmber: number };
export type DailyLight = { level: "green" | "amber" | "red"; label: string; reasons: string[] };

export function dailyLight(i: LightInput, p: LightPrefs): DailyLight {
  const red: string[] = [];
  const amber: string[] = [];
  if (i.readiness != null) {
    if (i.readiness < p.lightReadinessRed) red.push(`readiness ${Math.round(i.readiness)}`);
    else if (i.readiness < p.lightReadinessAmber) amber.push(`readiness ${Math.round(i.readiness)}`);
  }
  if (i.hooper != null) {
    if (i.hooper >= p.lightHooperRed) red.push(`índice Hooper ${i.hooper}`);
    else if (i.hooper >= p.lightHooperAmber) amber.push(`índice Hooper ${i.hooper}`);
  }
  if (i.maxPain != null) {
    if (i.maxPain >= p.lightPainRed) red.push(`dolor ${i.maxPain}/10 en una molestia`);
    else if (i.maxPain >= p.lightPainRed - 2) amber.push(`dolor ${i.maxPain}/10 en una molestia`);
  }
  if (i.protocolPhase) amber.push(`vuelta por fases: ${i.protocolPhase}`);
  if (i.zoneFatigue && i.zoneFatigue.value >= p.lightZoneAmber) amber.push(`fatiga ${i.zoneFatigue.value}/10 en ${i.zoneFatigue.zone}`);
  if (i.cycleSuggestion) amber.push(i.cycleSuggestion.toLowerCase());
  if (red.length) return { level: "red", label: "Hoy, descanso o recuperación activa", reasons: [...red, ...amber] };
  if (amber.length) return { level: "amber", label: "Hoy, versión suave o menos volumen", reasons: amber };
  return { level: "green", label: "Hoy, entrena con normalidad", reasons: i.readiness == null && i.hooper == null ? ["sin registro de recuperación de hoy"] : [] };
}
