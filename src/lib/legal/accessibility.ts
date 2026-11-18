/**
 * v3.0 · Bloque T · Estado real de accesibilidad (declaración en /legal/accesibilidad).
 * No se marca cumplimiento total: la prueba con lector de pantalla real está pendiente (docs/auditoria-v3-0.md § 5).
 * Al cambiar algo aquí, actualizar también esa sección.
 */
export type A11yStatus = "partial" | "full" | "none";

export const A11Y_STATUS: A11yStatus = "partial";
export const A11Y_REVIEWED = "2026-11-18";

export const A11Y_STATUS_LABEL: Record<A11yStatus, string> = {
  partial: "parcialmente conforme con WCAG 2.2 nivel AA",
  full: "conforme con WCAG 2.2 nivel AA",
  none: "no conforme con WCAG 2.2 nivel AA",
};

export const A11Y_VERIFIED = [
  "Comprobación automática (axe, WCAG 2.2 AA) en un recorrido por las ocho verticales, en tema claro, oscuro y alto contraste.",
  "Pasada automatizada de teclado: enlace «Saltar al contenido», orden de tabulación, foco visible y no tapado por la barra inferior.",
  "Tamaño de objetivo táctil de 44 px en los controles y texto que escala con la preferencia de tamaño de letra.",
  "Alternativa en tabla y resumen en texto de los gráficos de carga (PMC), finanzas y composición corporal.",
  "Los avisos emergentes se anuncian en una región viva etiquetada «Avisos».",
];

export const A11Y_KNOWN_ISSUES = [
  "Todavía no se ha probado con un lector de pantalla real (VoiceOver, TalkBack o NVDA): puede haber fallos que la comprobación automática no detecta.",
  "Los bordes de los campos de formulario tienen poco contraste en tema claro y oscuro (criterio 1.4.11); cada campo lleva etiqueta visible.",
  "Algunos colores de aviso y de las series de presupuestos tienen poco contraste como elemento gráfico (1.4.11); siempre van acompañados de icono, texto o leyenda.",
  "En «Nueva sesión» la barra fija de guardado puede tapar parcialmente unos botones al cargar (2.5.8); se corrige en el rediseño de Entreno.",
  "Los gráficos que no son de carga, finanzas ni composición (marcas, e1RM, proyecciones) aún no tienen tabla alternativa.",
];
