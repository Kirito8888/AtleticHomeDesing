"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { TESTS_TABS, testsTabActive } from "@/lib/training/hub-links";
import { cn } from "@/lib/utils";

/** Pestañas-enlace de Tests físicos (Resultados · Medir salto · Comparar · Curvas). */
export function TestsNav() {
  const active = testsTabActive(usePathname());
  return (
    <nav aria-label="Secciones de tests" className="mb-4 flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
      {TESTS_TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === active ? "page" : undefined}
          className={cn("flex min-h-11 shrink-0 items-center rounded-md px-3 text-sm font-medium text-muted-foreground", t.href === active && "bg-background text-foreground shadow-sm")}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
