import type { Family } from "./disciplines";

/** v2.3 B2 · Accesos del módulo de entrenamiento (solo enlaces; nada lee datos). */
export type HubIcon = "tests" | "jump" | "performance" | "rm" | "compare" | "javelin" | "routine" | "library" | "seasons" | "diary" | "prehab" | "equipment";
export type HubLink = { href: string; label: string; icon: HubIcon };
export type HubSection = { id: "measure" | "plan"; label: string; links: HubLink[] };

export function trainingHubSections(family: Family): HubSection[] {
  return [
    {
      id: "measure",
      label: "Medir y analizar",
      links: [
        { href: "/training/tests", label: "Tests físicos", icon: "tests" },
        { href: "/training/tests/salto", label: "Medir salto", icon: "jump" },
        { href: "/training/performance", label: "Rendimiento", icon: "performance" },
        { href: "/training/rm", label: "Mis RM", icon: "rm" },
        { href: "/training/compare", label: "Comparar sesiones", icon: "compare" },
        ...(family === "throws" ? [{ href: "/training/javelin", label: "Análisis de jabalina", icon: "javelin" as const }] : []),
      ],
    },
    {
      id: "plan",
      label: "Planificar y biblioteca",
      links: [
        { href: "/training/routine", label: "Crear mi rutina", icon: "routine" },
        { href: "/training/exercises", label: "Biblioteca de ejercicios", icon: "library" },
        { href: "/training/seasons", label: "Temporadas", icon: "seasons" },
        { href: "/training/diary", label: "Diario técnico", icon: "diary" },
        { href: "/training/prehab", label: "Prehabilitación", icon: "prehab" },
        { href: "/training/equipment", label: "Material", icon: "equipment" },
      ],
    },
  ];
}

/** Pestañas compartidas por Tests, Medir salto, Comparar y Curvas. */
export const TESTS_TABS = [
  { href: "/training/tests", label: "Resultados" },
  { href: "/training/tests/salto", label: "Medir salto" },
  { href: "/training/tests/comparar", label: "Comparar" },
  { href: "/training/tests/curvas", label: "Curvas" },
] as const;

/** Pestaña activa: «Resultados» solo en su ruta exacta; el resto por prefijo. */
export function testsTabActive(pathname: string): string | null {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p === "/training/tests") return "/training/tests";
  return TESTS_TABS.find((t) => t.href !== "/training/tests" && (p === t.href || p.startsWith(`${t.href}/`)))?.href ?? null;
}

export type PerformanceSection = "load" | "strength" | "throws" | "season";
export const PERFORMANCE_SECTION_LABEL: Record<PerformanceSection, string> = { load: "Carga", strength: "Fuerza", throws: "Lanzamientos", season: "Temporada" };

/** Lo de su prueba primero: quien no lanza ve la fuerza antes que los lanzamientos. */
export function performanceSectionOrder(family: Family): PerformanceSection[] {
  return family === "throws" ? ["load", "throws", "season", "strength"] : ["load", "strength", "throws", "season"];
}
