export const MEAL_LABEL = {
  BREAKFAST: "Desayuno",
  MID_MORNING: "Media mañana",
  LUNCH: "Comida",
  SNACK: "Merienda",
  DINNER: "Cena",
  PRE_WORKOUT: "Pre-entreno",
  POST_WORKOUT: "Post-entreno",
  OTHER: "Otro",
} as const;

/** Comida sugerida según la hora local. */
export function defaultMeal(): keyof typeof MEAL_LABEL {
  const h = new Date().getHours();
  if (h < 11) return "BREAKFAST";
  if (h < 13) return "MID_MORNING";
  if (h < 16) return "LUNCH";
  if (h < 20) return "SNACK";
  return "DINNER";
}
