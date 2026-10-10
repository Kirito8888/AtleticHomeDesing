import { Activity, Apple, Brain, CalendarDays, HeartPulse, LayoutDashboard, Settings, Wallet } from "lucide-react";

/** `module`: lo que se puede ocultar en Ajustes → Módulos (v1.8). Inicio y Ajustes siempre están. */
export const NAV_ITEMS = [
  { href: "/", label: "Inicio", icon: LayoutDashboard, mobile: true, module: null },
  { href: "/training", label: "Entreno", icon: Activity, mobile: true, module: "training" },
  { href: "/recovery", label: "Recuperación", icon: HeartPulse, mobile: false, module: "recovery" },
  { href: "/planning", label: "Plan", icon: CalendarDays, mobile: true, module: "planning" },
  { href: "/nutrition", label: "Nutrición", icon: Apple, mobile: true, module: "nutrition" },
  { href: "/finance", label: "Finanzas", icon: Wallet, mobile: false, module: "finance" },
  { href: "/study", label: "Astras AI", icon: Brain, mobile: true, module: "study" },
  { href: "/settings", label: "Ajustes", icon: Settings, mobile: false, module: null },
] as const;

export type ModuleKey = NonNullable<(typeof NAV_ITEMS)[number]["module"]>;
export const MODULE_LABEL: Record<ModuleKey, string> = { training: "Entreno", recovery: "Recuperación", planning: "Planificación", nutrition: "Nutrición", finance: "Finanzas", study: "Astras AI (estudio)" };

/** Navegación sin los módulos ocultos; en la barra inferior, si se ocultan principales, entran otros. */
export function visibleNav(hidden: readonly string[]) {
  const all = NAV_ITEMS.filter((i) => !i.module || !hidden.includes(i.module));
  const primary = all.filter((i) => i.mobile);
  const extra = all.filter((i) => !i.mobile && i.href !== "/settings");
  return { all, mobile: [...primary, ...extra].slice(0, 5) };
}
