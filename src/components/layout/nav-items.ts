import { Activity, Apple, CalendarDays, Bell, GraduationCap, HeartPulse, Info, LayoutDashboard, Settings, ShieldCheck, Target, UserCog, Users, UsersRound, Wallet } from "lucide-react";

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

/**
 * v3.0 G (V3-D01) · Secciones agrupadas por intención (qué quiere hacer la usuaria, no qué módulo es):
 * lo mismo en la barra lateral y en el «Más» del móvil. Ver docs/diseno-v3.md § Navegación.
 */
export const NAV_GROUPS: readonly { id: string; label: string; items: readonly NavItem[] }[] = [
  {
    id: "train",
    label: "Entrenar",
    items: [
      { href: "/training", label: "Entreno", icon: Activity, module: "training" },
      { href: "/planning", label: "Plan", icon: CalendarDays, module: "planning" },
      { href: "/goals", label: "Objetivos", icon: Target, module: null },
    ],
  },
  {
    id: "care",
    label: "Cuidarme",
    items: [
      { href: "/recovery", label: "Salud", icon: HeartPulse, module: "recovery" },
      { href: "/nutrition", label: "Nutrición", icon: Apple, module: "nutrition" },
    ],
  },
  {
    id: "organize",
    label: "Organizarme",
    items: [
      { href: "/study", label: "Estudio", icon: GraduationCap, module: "study" },
      { href: "/finance", label: "Finanzas", icon: Wallet, module: "finance" },
    ],
  },
  {
    id: "people",
    label: "Con otras personas",
    items: [
      { href: "/clubs", label: "Clubes", icon: Users, module: null },
      { href: "/coach", label: "Mis atletas", icon: UsersRound, module: null, roles: ["COACH", "ADMIN"] },
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
export const MODULE_LABEL: Record<ModuleKey, string> = { training: "Entreno", recovery: "Recuperación", planning: "Planificación", nutrition: "Nutrición", finance: "Finanzas", study: "Estudio" };

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

/** Orden por defecto de la barra inferior (cuenta sin uso ni elección); si se ocultan módulos entran los siguientes. */
export const BAR_DEFAULT = ["/training", "/planning", "/recovery", "/nutrition", "/goals", "/clubs"] as const;
export const BAR_SLOTS = 3; // + Inicio + «Más» = 5 huecos
/** Visitas mínimas (8 semanas) para que el uso cuente al sugerir la barra: una visita suelta no la cambia. */
export const BAR_USAGE_MIN = 5;
const CONFIG_GROUP = "config";

/** Destinos que pueden ir en la barra: todo salvo Configuración, en el orden del menú. */
export function barCandidates(groups: readonly { id: string; items: readonly NavItem[] }[]) {
  return groups.filter((g) => g.id !== CONFIG_GROUP).flatMap((g) => g.items);
}

const rank = (href: string) => {
  const i = (BAR_DEFAULT as readonly string[]).indexOf(href);
  const j = NAV_GROUPS.flatMap((g) => g.items).findIndex((x) => x.href === href);
  return i >= 0 ? i : BAR_DEFAULT.length + j;
};

/**
 * v3.0 G · Barra sugerida por el uso (`UsageBeacon` → `PageUsage`): los {@link BAR_SLOTS} destinos más abiertos
 * con al menos {@link BAR_USAGE_MIN} visitas, completados con el orden por defecto. Se ordenan por la posición
 * por defecto (no por visitas) para que la barra no baile de una semana a otra.
 */
export function suggestBar(usage: readonly { path: string; count: number }[], available: readonly string[]): string[] {
  const visits = new Map<string, number>();
  for (const href of available) visits.set(href, usage.filter((u) => isActive(u.path, href)).reduce((a, u) => a + u.count, 0));
  const used = [...available].filter((h) => (visits.get(h) ?? 0) >= BAR_USAGE_MIN).sort((a, b) => (visits.get(b) ?? 0) - (visits.get(a) ?? 0) || rank(a) - rank(b)).slice(0, BAR_SLOTS);
  const rest = [...available].filter((h) => !used.includes(h)).sort((a, b) => rank(a) - rank(b));
  return [...used, ...rest].slice(0, BAR_SLOTS).sort((a, b) => rank(a) - rank(b));
}

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Navegación según módulos ocultos y rol (la barra nunca lee datos: solo enlaces). `bar` es la elección de
 * la usuaria (`prefs.mobileBar`) o la sugerida por el uso; lo que no sea un destino disponible se ignora y
 * los huecos libres se completan con el orden por defecto.
 */
export function buildNav({ hidden = [], role = "ATHLETE", bar: chosen }: { hidden?: readonly string[]; role?: NavRole | string; bar?: readonly string[] | null } = {}) {
  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => (!i.module || !hidden.includes(i.module)) && (!i.roles || i.roles.includes(role as NavRole))),
  })).filter((g) => g.items.length > 0);
  const candidates = barCandidates(groups);
  const valid = [...new Set(chosen ?? [])].filter((h) => candidates.some((i) => i.href === h)).slice(0, BAR_SLOTS);
  const fill = suggestBar([], candidates.map((i) => i.href)).concat(candidates.map((i) => i.href)).filter((h, k, a) => !valid.includes(h) && a.indexOf(h) === k);
  const hrefs = [...valid, ...fill].slice(0, BAR_SLOTS);
  const bar = [HOME, ...hrefs.map((h) => candidates.find((i) => i.href === h)!)];
  return { home: HOME, groups, bar, candidates };
}

/** Qué entrada del conjunto está activa: la de href más largo (Privacidad no marca también Ajustes). */
export function activeHref(pathname: string, hrefs: readonly string[]) {
  return hrefs.filter((h) => isActive(pathname, h)).sort((a, b) => b.length - a.length)[0] ?? null;
}

/** «Más» se marca cuando la ruta actual no es de ninguna pestaña de la barra. */
export function moreActive(pathname: string, bar: readonly NavItem[]) {
  return pathname !== "/" && !bar.some((i) => i.href !== "/" && isActive(pathname, i.href));
}
