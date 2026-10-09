import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pageUser } from "@/lib/auth/page";
import { formatDate, formatNum, TECHNICAL_EVENT_LABEL } from "@/lib/format";
import { technicalDiary } from "@/lib/training/v17-service";

export const metadata = { title: "Diario técnico · LifeOS" };

/** v1.7 · Diario técnico: claves, foco, notas y etiquetas de cada sesión técnica, con búsqueda. */
export default async function DiaryPage({ searchParams }: PageProps<"/training/diary">) {
  const user = await pageUser();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : null;
  const tag = typeof sp.tag === "string" ? sp.tag.slice(0, 30) : null;
  const { rows, tags } = await technicalDiary(user.id, q, tag);
  return (
    <>
      <PageHeader title="Diario técnico" description="Lo que trabajaste y sentiste en cada sesión técnica. Etiqueta las sesiones al registrarlas para encontrarlas luego." />
      <form className="mb-3 flex gap-2" role="search">
        <Input name="q" aria-label="Buscar en el diario" placeholder="Buscar: bloqueo, viento, brazo…" defaultValue={q ?? ""} />
        {tag ? <input type="hidden" name="tag" value={tag} /> : null}
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </form>
      {tags.length ? (
        <nav aria-label="Etiquetas" className="mb-3 flex flex-wrap gap-1.5 text-xs">
          {tags.map((t) => (
            <Link key={t.tag} href={tag === t.tag ? "?" : `?tag=${encodeURIComponent(t.tag)}`} className={`rounded-full border px-2.5 py-1 ${tag === t.tag ? "border-primary bg-primary text-primary-foreground" : ""}`}>
              #{t.tag} <span className="opacity-70">{t.n}</span>
            </Link>
          ))}
        </nav>
      ) : null}
      <ul className="grid gap-2" aria-label="Entradas del diario">
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={`/training/${r.id}`} className="block rounded-md border p-3 text-sm hover:bg-accent">
              <p className="flex justify-between gap-2">
                <span className="font-medium">
                  {formatDate(r.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · {r.technical ? (TECHNICAL_EVENT_LABEL[r.technical.event] ?? r.technical.event) : ""}
                  {r.technical?.implementWeightG ? ` ${r.technical.implementWeightG} g` : ""}
                </span>
                {r.technical?.bestMarkM ? <span className="shrink-0 tabular-nums">{formatNum(r.technical.bestMarkM, 2)} m</span> : null}
              </p>
              {r.technical?.cue ? <p>Clave: «{r.technical.cue}»</p> : null}
              {r.technical?.focus ? <p className="text-muted-foreground">Foco: {r.technical.focus}</p> : null}
              {r.notes ? <p className="line-clamp-3 text-muted-foreground">{r.notes}</p> : null}
              {r.tags.length ? <p className="mt-1 text-xs text-muted-foreground">{r.tags.map((t) => `#${t}`).join(" ")}</p> : null}
            </Link>
          </li>
        ))}
        {!rows.length ? <p className="text-sm text-muted-foreground">Nada con ese filtro todavía.</p> : null}
      </ul>
    </>
  );
}
