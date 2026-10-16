/** v2.3 B3 · Orden de las secciones del club y accesos de «Clubes y coach» (solo enlaces y orden; nada lee datos). */
export type ClubRole = "ADMIN" | "COACH" | "ATHLETE";
export type UserRole = "ATHLETE" | "COACH" | "ADMIN" | string;

export type ClubSectionId = "alertas" | "cumplimiento" | "calendario" | "miembros" | "cuotas";

/** Staff: lo accionable primero (alertas), luego seguimiento, luego gestión. Atleta: solo sus cuotas. */
export function clubSections({ role, hasPanel }: { role: ClubRole; hasPanel: boolean }): Array<{ id: ClubSectionId; label: string }> {
  const out: Array<{ id: ClubSectionId; label: string }> = [];
  if (hasPanel) {
    out.push({ id: "alertas", label: "Alertas" }, { id: "cumplimiento", label: "Cumplimiento" }, { id: "calendario", label: "Calendario" }, { id: "miembros", label: "Miembros" });
  }
  if (role === "ADMIN" || role === "ATHLETE") out.push({ id: "cuotas", label: "Cuotas" });
  return out;
}

export type CoachHubLink = { href: string; label: string };

/** Accesos de la página de Clubes. La atleta nunca ve «Mis atletas»; planificar exige algún vínculo con `canPlan`. */
export function coachHubLinks({ role, canPlanAny, hasProtocols = true }: { role: UserRole; canPlanAny: boolean; hasProtocols?: boolean }): CoachHubLink[] {
  const staff = role === "COACH" || role === "ADMIN";
  const links: CoachHubLink[] = [];
  if (staff) {
    links.push({ href: "/coach", label: "Mis atletas" });
    if (canPlanAny) links.push({ href: "/coach/multi", label: "Planificar varios" });
    links.push({ href: "/coach#comentar", label: "Comentar en bloque" });
  }
  if (hasProtocols) links.push({ href: "/recovery/fisio", label: "Protocolos de fisio" });
  links.push({ href: "/settings#entrenadora", label: "Mis entrenadoras" });
  return links;
}
