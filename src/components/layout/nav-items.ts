import { Activity, Apple, Brain, CalendarDays, Bell, HeartPulse, Info, LayoutDashboard, Settings, ShieldCheck, Target, UserCog, Users, UsersRound, Wallet } from "lucide-react";

export type NavRole = "ATHLETE" | "COACH" | "ADMIN";
type ModuleName = "training" | "recovery" | "planning" | "nutrition" | "finance" | "study";

export type NavItem = {
  href: string;
  label: string;
  icon: typeof Activity;
  /** Lo que se puede ocultar en Ajustes → Módulos (v1.8). */
  module: ModuleName | null;
  /** Si existe, solo lo ven esos roles. */
  roles?: readonly NavRole[];
};

export const HOME: NavItem = { href: "/", label: "Inicio", icon: LayoutDashboard, module: null };

/** v2.3 · Secciones agrupadas: lo mismo en la barra lateral y en el «Más» del móvil. */
export const NAV_GROUPS: readonly { id: string; label: string; items: readonly NavItem[] }[] = [
  {
    id: "training",
    label: "Entrenamiento y salud",
    items: [
      { href: "/training", label: "Entreno", icon: Activity, module: "training" },
      { href: "/planning", label: "Plan", icon: CalendarDays, module: "planning" },
      { href: "/recovery", label: "Salud", icon: HeartPulse, module: "recovery" },
      { href: "/nutrition", label: "Nutrición", icon: Apple, module: "nutrition" },
      { href: "/goals", label: "Objetivos", icon: Target, module: null },
    ],
  },
  {
    id: "clubs",
    label: "Clubes y coach",
    items: [
      { href: "/clubs", label: "Clubes", icon: Users, module: null },
      { href: "/coach", label: "Mis atletas", icon: UsersRound, module: null, roles: ["COACH", "ADMIN"] },
    ],
  },
  {
    id: "tools",
    label: "Herramientas",
    items: [
      { href: "/study", label: "Atlenza IA", icon: Brain, module: "study" },
      { href: "/finance", label: "Finanzas", icon: Wallet, module: "finance" },
    ],
  },
  {
    id: "config",
    label: "Configuración",
    items: [
      { href: "/settings", label: "Ajustes", icon: Settings, module: null },
      { href: "/settings/privacy", label: "Privacidad", icon: ShieldCheck, module: null },
      { href: "/notifications", label: "Notificaciones", icon: Bell, module: null },
      { href: "/admin", label: "Administración", icon: UserCog, module: null, roles: ["ADMIN"] },
      { href: "/about", label: "Acerca de", icon: Info, module: null },
    ],
  },
];

export type ModuleKey = ModuleName;
export const MODULE_LABEL: Record<ModuleKey, string> = { training: "Entreno", recovery: "Recuperación", planning: "Planificación", nutrition: "Nutrición", finance: "Finanzas", study: "Atlenza IA (estudio)" };

/** Exp. B10 · Lo que una cuenta nueva trae activado en la bienvenida; el resto se ofrece. */
export const NEW_ACCOUNT_MODULES: readonly ModuleKey[] = ["training", "recovery"];

/**
 * Módulos marcados al abrir la bienvenida: la cuenta que no la ha hecho y nunca ocultó nada parte de
 * {@link NEW_ACCOUNT_MODULES}; si ya eligió (bienvenida hecha o algo oculto), se respeta lo suyo.
 * No escribe nada: el menú solo cambia al terminar la bienvenida.
 */
export function welcomeModules({ onboarded, hidden }: { onboarded: boolean; hidden: readonly string[] }): ModuleKey[] {
  const all = Object.keys(MODULE_LABEL) as ModuleKey[];
  if (!onboarded && hidden.length === 0) return all.filter((m) => NEW_ACCOUNT_MODULES.includes(m));
  return all.filter((m) => !hidden.includes(m));
}

/** Candidatos de la barra inferior, por prioridad; si se ocultan módulos entran los siguientes. */
const BAR_ORDER = ["/training", "/planning", "/recovery", "/nutrition", "/goals", "/clubs"] as const;
const BAR_SLOTS = 3; // + Inicio + «Más» = 5 huecos

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Navegación según módulos ocultos y rol (la barra nunca lee datos: solo enlaces). */
export function buildNav({ hidden = [], role = "ATHLETE" }: { hidden?: readonly string[]; role?: NavRole | string } = {}) {
  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => (!i.module || !hidden.includes(i.module)) && (!i.roles || i.roles.includes(role as NavRole))),
  })).filter((g) => g.items.length > 0);
  const flat = groups.flatMap((g) => g.items);
  const bar = [HOME, ...BAR_ORDER.map((h) => flat.find((i) => i.href === h)).filter((i): i is NavItem => !!i).slice(0, BAR_SLOTS)];
  return { home: HOME, groups, bar };
}

/** Qué entrada del conjunto está activa: la de href más largo (Privacidad no marca también Ajustes). */
export function activeHref(pathname: string, hrefs: readonly string[]) {
  return hrefs.filter((h) => isActive(pathname, h)).sort((a, b) => b.length - a.length)[0] ?? null;
}

/** «Más» se marca cuando la ruta actual no es de ninguna pestaña de la barra. */
export function moreActive(pathname: string, bar: readonly NavItem[]) {
  return pathname !== "/" && !bar.some((i) => i.href !== "/" && isActive(pathname, i.href));
}
