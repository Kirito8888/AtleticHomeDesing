"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";

/**
 * Optimización B2 · Las pestañas de /study que no se ven al entrar (Resumir, Pasos,
 * Manual, Chat, Flashcards y Coach) se piden como chunks aparte: la pestaña de Apuntes aparece
 * antes en el móvil. Radix no monta el contenido de las pestañas inactivas, así que su chunk no
 * se descarga hasta que hace falta o hasta que el navegador queda libre (`PreloadStudyTabs`).
 * Con `?tab=…` la pestaña activa sigue pintándose en el servidor, sin cambio visual. Asignaturas
 * queda fuera: es destino de enlaces reales (volver desde una asignatura) y con el panel diferido
 * lo escrito antes de hidratar se perdía (el botón «Crear» quedaba desactivado).
 */
const loaders = {
  adapt: () => import("@/components/study/adapt-panel").then((m) => m.AdaptPanel),
  steps: () => import("@/components/study/micro-steps-panel").then((m) => m.MicroStepsPanel),
  manual: () => import("@/components/study/manual-panel").then((m) => m.ManualPanel),
  chat: () => import("@/components/study/study-chat").then((m) => m.StudyChat),
  review: () => import("@/components/study/flashcard-review").then((m) => m.FlashcardReview),
  cards: () => import("@/components/study/coursework").then((m) => m.ManualCards),
  coach: () => import("@/components/study/coach-panel").then((m) => m.CoachPanel),
};

export const AdaptPanel = dynamic(loaders.adapt);
export const MicroStepsPanel = dynamic(loaders.steps);
export const ManualPanel = dynamic(loaders.manual);
export const StudyChat = dynamic(loaders.chat);
export const FlashcardReview = dynamic(loaders.review);
export const ManualCards = dynamic(loaders.cards);
export const CoachPanel = dynamic(loaders.coach);

/** Descarga los chunks de las pestañas cuando el navegador está libre, para que al tocarlas no haya espera. */
export function PreloadStudyTabs() {
  useEffect(() => {
    const run = () => Object.values(loaders).forEach((load) => void load().catch(() => {}));
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(run, { timeout: 4000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(run, 2000);
    return () => clearTimeout(id);
  }, []);
  return null;
}
