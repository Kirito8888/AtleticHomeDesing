"use client";

import dynamic from "next/dynamic";

/**
 * v1.8 · Las gráficas (recharts, ~110 KB gzip) se cargan después del resto de la página: lo que
 * se lee primero (cifras, listas) aparece antes, sobre todo en el móvil. Mientras, un hueco del
 * mismo alto para que la página no salte.
 */
const Hold = ({ h = "h-44" }: { h?: string }) => <div className={`${h} w-full animate-pulse rounded-md bg-muted/40`} aria-hidden="true" />;

export const ProjectionChart = dynamic(() => import("@/components/routine/projection-chart").then((m) => m.ProjectionChart), { ssr: false, loading: () => <Hold /> });
export const CashflowChart = dynamic(() => import("@/components/finance/cashflow-chart").then((m) => m.CashflowChart), { ssr: false, loading: () => <Hold h="h-56" /> });
export const ValueChart = dynamic(() => import("@/components/training/value-chart").then((m) => m.ValueChart), { ssr: false, loading: () => <Hold /> });
export const E1rmChart = dynamic(() => import("@/components/training/e1rm-chart").then((m) => m.E1rmChart), { ssr: false, loading: () => <Hold /> });
export const AttemptsScatter = dynamic(() => import("@/components/training/attempts-scatter").then((m) => m.AttemptsScatter), { ssr: false, loading: () => <Hold /> });
export const MarksChart = dynamic(() => import("@/components/training/marks-chart").then((m) => m.MarksChart), { ssr: false, loading: () => <Hold /> });
export const PmcCharts = dynamic(() => import("@/components/training/pmc-charts").then((m) => m.PmcCharts), { ssr: false, loading: () => <Hold h="h-72" /> });
