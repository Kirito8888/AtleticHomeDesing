"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Activity, LogOut, Menu, Search } from "lucide-react";

import { logoutAction } from "@/app/(auth)/actions";
import { activeHref, buildNav, moreActive, type NavItem } from "@/components/layout/nav-items";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

function NavLinks({ pathname, onNavigate, nav, touch }: { pathname: string; onNavigate?: () => void; nav: ReturnType<typeof buildNav>; touch?: boolean }) {
  const current = activeHref(pathname, [nav.home.href, ...nav.groups.flatMap((g) => g.items.map((i) => i.href))]);
  const link = ({ href, label, icon: Icon }: NavItem) => (
    <Link
      key={href}
      href={href}
      onClick={onNavigate}
      aria-current={current === href ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        touch && "min-h-11",
        current === href && "bg-accent text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
  return (
    <nav aria-label="Secciones" className="grid gap-3">
      {link(nav.home)}
      {nav.groups.map((g) => (
        <div key={g.id} role="group" aria-labelledby={`nav-g-${touch ? "m" : "d"}-${g.id}`} className="grid gap-1">
          <h2 id={`nav-g-${touch ? "m" : "d"}-${g.id}`} className="px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {g.label}
          </h2>
          {g.items.map(link)}
        </div>
      ))}
    </nav>
  );
}

function LogoutButton() {
  return (
    <form action={logoutAction}>
      <Button type="submit" variant="ghost" className="min-h-11 w-full justify-start gap-3 text-muted-foreground">
        <LogOut className="size-4" /> Salir
      </Button>
    </form>
  );
}

/** Barra lateral (≥ md) + barra superior y barra inferior con «Más» (móvil). */
export function AppNav({ userName, hidden = [], role = "ATHLETE", bell }: { userName: string | null; hidden?: readonly string[]; role?: string; bell?: React.ReactNode }) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const nav = buildNav({ hidden, role });
  const barCurrent = activeHref(pathname, nav.bar.map((i) => i.href));
  const moreOn = moreActive(pathname, nav.bar);
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col overflow-y-auto border-r bg-background p-3 md:flex">
        <Link href="/" className="mb-4 flex items-center gap-2 px-3 py-2 text-lg font-bold tracking-tight">
          <Activity className="size-5" /> Atlenza
        </Link>
        <form role="search" action="/search" className="mb-3 px-1">
          <input name="q" type="search" aria-label="Buscar" placeholder="Buscar…" className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" />
        </form>
        <NavLinks pathname={pathname} nav={nav} />
        <div className="mt-auto grid gap-1 border-t pt-3">
          <div className="flex items-center justify-between px-3">
            <span className="truncate text-sm text-muted-foreground">{userName}</span>
            <span className="flex items-center">
              {bell}
              <ThemeToggle />
            </span>
          </div>
          <LogoutButton />
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
        <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
          <Activity className="size-5" /> Atlenza
        </Link>
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="icon">
            <Link href="/search" aria-label="Buscar">
              <Search />
            </Link>
          </Button>
          {bell}
          <ThemeToggle />
        </div>
      </header>

      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-30 grid border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        style={{ gridTemplateColumns: `repeat(${nav.bar.length + 1}, minmax(0, 1fr))` }}
      >
        {nav.bar.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={barCurrent === href && !moreOn ? "page" : undefined}
            className={cn(
              "flex min-h-11 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground",
              barCurrent === href && !moreOn && "text-foreground",
            )}
          >
            <Icon className="size-5" />
            {label}
          </Link>
        ))}
        <Sheet open={more} onOpenChange={setMore}>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label="Más secciones"
              aria-current={moreOn ? "page" : undefined}
              className={cn("flex min-h-11 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground", moreOn && "text-foreground")}
            >
              <Menu className="size-5" />
              Más
            </button>
          </SheetTrigger>
          <SheetContent>
            <SheetTitle>{userName ?? "Menú"}</SheetTitle>
            <NavLinks pathname={pathname} nav={nav} onNavigate={() => setMore(false)} touch />
            <LogoutButton />
          </SheetContent>
        </Sheet>
      </nav>
    </>
  );
}
