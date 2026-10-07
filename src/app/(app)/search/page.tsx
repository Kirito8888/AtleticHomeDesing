import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pageUser } from "@/lib/auth/page";
import { searchAll } from "@/lib/search";

export const metadata = { title: "Buscar · LifeOS" };

/** Búsqueda global: un formulario GET, sin JavaScript. */
export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const user = await pageUser();
  const { q: raw } = await searchParams;
  const q = typeof raw === "string" ? raw : "";
  const groups = await searchAll(user.id, q);
  return (
    <>
      <PageHeader title="Buscar" description="Sesiones, ejercicios, días del plan, tareas y apuntes" />
      <form role="search" action="/search" className="mb-6 flex gap-2">
        <Input name="q" type="search" defaultValue={q} placeholder="p. ej. sentadilla, M5, examen…" aria-label="Buscar" autoFocus minLength={2} maxLength={80} />
        <Button type="submit">Buscar</Button>
      </form>
      {q.trim().length >= 2 && !groups.length ? <p className="text-sm text-muted-foreground">Sin resultados para «{q}».</p> : null}
      <div className="grid gap-6 lg:grid-cols-2">
        {groups.map((g) => (
          <section key={g.key} aria-labelledby={`g-${g.key}`}>
            <h2 id={`g-${g.key}`} className="mb-2 text-sm font-semibold">
              {g.label} <span className="font-normal text-muted-foreground">({g.hits.length})</span>
            </h2>
            <ul className="grid gap-1">
              {g.hits.map((h, i) => (
                <li key={`${h.href}-${i}`}>
                  <Link href={h.href} className="block rounded-md border px-3 py-2 text-sm hover:bg-accent">
                    <span className="font-medium">{h.title}</span>
                    {h.detail ? <span className="block text-xs text-muted-foreground">{h.detail}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
