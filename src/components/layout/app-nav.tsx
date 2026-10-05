"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, LogOut, Menu } from "lucide-react";

import { logoutAction } from "@/app/(auth)/actions";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="grid gap-1">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
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
export function AppNav({ userName }: { userName: string | null }) {
  const pathname = usePathname();
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r bg-background p-3 md:flex">
        <Link href="/" className="mb-4 flex items-center gap-2 px-3 py-2 text-lg font-bold tracking-tight">
          <Activity className="size-5" /> LifeOS
        </Link>
        <NavLinks pathname={pathname} />
        <div className="mt-auto grid gap-1 border-t pt-3">
          <div className="flex items-center justify-between px-3">
            <span className="truncate text-sm text-muted-foreground">{userName}</span>
            <ThemeToggle />
          </div>
          <LogoutButton />
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
        <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
          <Activity className="size-5" /> LifeOS
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Menú">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetTitle>{userName ?? "Menú"}</SheetTitle>
              <NavLinks pathname={pathname} />
              <LogoutButton />
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {NAV_ITEMS.filter((i) => i.mobile).map(({ href, label, icon: Icon }) => (
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
