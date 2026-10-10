"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, LogOut, Menu, Search } from "lucide-react";

import { logoutAction } from "@/app/(auth)/actions";
import { visibleNav } from "@/components/layout/nav-items";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ pathname, onNavigate, items }: { pathname: string; onNavigate?: () => void; items: ReturnType<typeof visibleNav>["all"] }) {
  return (
    <nav className="grid gap-1">
      {items.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={onNavigate}
          aria-current={isActive(pathname, href) ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            isActive(pathname, href) && "bg-accent text-foreground",
          )}
        >
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

function LogoutButton() {
  return (
    <form action={logoutAction}>
      <Button type="submit" variant="ghost" className="w-full justify-start gap-3 text-muted-foreground">
        <LogOut className="size-4" /> Salir
      </Button>
    </form>
  );
}

/** Barra lateral (≥ md) + barra superior y navegación inferior (móvil). */
export function AppNav({ userName, hidden = [], bell }: { userName: string | null; hidden?: readonly string[]; bell?: React.ReactNode }) {
  const pathname = usePathname();
  const nav = visibleNav(hidden);
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r bg-background p-3 md:flex">
        <Link href="/" className="mb-4 flex items-center gap-2 px-3 py-2 text-lg font-bold tracking-tight">
          <Activity className="size-5" /> Atlenza
        </Link>
        <form role="search" action="/search" className="mb-3 px-1">
          <input name="q" type="search" aria-label="Buscar" placeholder="Buscar…" className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" />
        </form>
        <NavLinks pathname={pathname} items={nav.all} />
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
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Menú">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetTitle>{userName ?? "Menú"}</SheetTitle>
              <NavLinks pathname={pathname} items={nav.all} />
              <LogoutButton />
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-30 grid border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        style={{ gridTemplateColumns: `repeat(${nav.mobile.length}, minmax(0, 1fr))` }}
      >
        {nav.mobile.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(pathname, href) ? "page" : undefined}
            className={cn(
              "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground",
              isActive(pathname, href) && "text-foreground",
            )}
          >
            <Icon className="size-5" />
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}
