/** v2.3 B4 · Orden de Ajustes (solo estructura; nada lee datos). */
export type SettingsGroupId = "entreno" | "entrenadora" | "avisos" | "conexiones" | "cuenta" | "datos" | "admin";
export type SettingsGroup = { id: SettingsGroupId; label: string; sections: string[] };

export const SETTINGS_GROUPS: SettingsGroup[] = [
  { id: "entreno", label: "Perfil y entreno", sections: ["perfil", "umbrales", "mis-reglas", "nutricion", "ejercicios", "pista"] },
  { id: "entrenadora", label: "Entrenadora", sections: ["entrenadora", "informe"] },
  { id: "avisos", label: "Avisos y app", sections: ["notificaciones", "modulos", "accesibilidad", "uso", "calendario"] },
  { id: "conexiones", label: "Conexiones e IA", sections: ["strava", "ia", "privacidad"] },
  { id: "cuenta", label: "Cuenta y seguridad", sections: ["seguridad", "llaves", "dos-pasos", "actividad", "entreno-sola"] },
  { id: "datos", label: "Tus datos", sections: ["papelera", "datos", "acerca"] },
  { id: "admin", label: "Administración", sections: ["servidor", "administracion"] },
];

/** Grupos visibles: «Administración» solo para ADMIN. */
export function settingsGroups(role: string): SettingsGroup[] {
  return SETTINGS_GROUPS.filter((g) => g.id !== "admin" || role === "ADMIN");
}
