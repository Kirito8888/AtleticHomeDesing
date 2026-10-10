import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { pageUser } from "@/lib/auth/page";
import { formatDate, SESSION_TYPE_LABEL } from "@/lib/format";
import { compareSessions } from "@/lib/training/competition-tools";
import { recentSessionsForPick, sessionForCompare } from "@/lib/training/diary-service";
import { cn } from "@/lib/utils";

export const metadata = { title: "Comparar sesiones · Atlenza" };

/** v1.7 · Comparador de dos sesiones: duración, RPE, carga, marca, lanzamientos y volumen. */
export default async function ComparePage({ searchParams }: PageProps<"/training/compare">) {
  const user = await pageUser();
  const sp = await searchParams;
  const [list, a, b] = await Promise.all([
    recentSessionsForPick(user.id),
    typeof sp.a === "string" ? sessionForCompare(user.id, sp.a) : null,
    typeof sp.b === "string" ? sessionForCompare(user.id, sp.b) : null,
  ]);
  const label = (s: { date: string; title: string | null; type: string }) => `${formatDate(s.date, { day: "numeric", month: "short", year: "2-digit" })} · ${s.title ?? (SESSION_TYPE_LABEL as Record<string, string>)[s.type] ?? s.type}`;
  const rows = a && b ? compareSessions(a, b) : [];
  return (
    <>
      <PageHeader title="Comparar sesiones" description="Dos sesiones lado a lado: qué cambió." />
      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        {(["a", "b"] as const).map((k) => (
          <Select key={k} name={k} aria-label={k === "a" ? "Sesión A" : "Sesión B"} defaultValue={(k === "a" ? a?.id : b?.id) ?? ""}>
            <option value="">{k === "a" ? "Sesión A…" : "Sesión B…"}</option>
            {list.map((s) => (
              <option key={s.id} value={s.id}>
                {label(s)}
              </option>
            ))}
          </Select>
        ))}
        <Button type="submit">Comparar</Button>
      </form>
      {a && b ? (
        <table className="w-full text-sm" aria-label="Comparación">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-1 text-left font-normal" />
              <th className="py-1 text-right font-normal">A · {label(a)}</th>
              <th className="py-1 text-right font-normal">B · {label(b)}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t">
                <td className="py-1.5">{r.label}</td>
                <td className={cn("py-1.5 text-right tabular-nums", r.better === "a" && "font-semibold")}>{r.a ?? "—"} {r.a != null ? r.unit : ""}</td>
                <td className={cn("py-1.5 text-right tabular-nums", r.better === "b" && "font-semibold")}>
                  {r.b ?? "—"} {r.b != null ? r.unit : ""}
                  {r.diff ? <span className="ml-1 text-xs text-muted-foreground">({r.diff > 0 ? "+" : ""}{r.diff})</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-muted-foreground">Elige dos sesiones.</p>
      )}
    </>
  );
}
