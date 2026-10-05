import { Activity, Apple, Brain, CalendarDays, HeartPulse, LayoutDashboard, Settings, Wallet } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/", label: "Inicio", icon: LayoutDashboard, mobile: true },
  { href: "/training", label: "Entreno", icon: Activity, mobile: true },
  { href: "/recovery", label: "Recuperación", icon: HeartPulse, mobile: false },
  { href: "/planning", label: "Plan", icon: CalendarDays, mobile: true },
  { href: "/nutrition", label: "Nutrición", icon: Apple, mobile: true },
  { href: "/finance", label: "Finanzas", icon: Wallet, mobile: false },
  { href: "/study", label: "Astras AI", icon: Brain, mobile: true },
  { href: "/settings", label: "Ajustes", icon: Settings, mobile: false },
] as const;
