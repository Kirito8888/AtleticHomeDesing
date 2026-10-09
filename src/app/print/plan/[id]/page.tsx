import { notFound } from "next/navigation";

import { PrintButton } from "@/components/print-button";
import { pageUser } from "@/lib/auth/page";
import { dayView } from "@/lib/ai-plan/day-view";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { annotateKg } from "@/lib/training/plan-to-form";
import { rmContext } from "@/lib/training/rm-service";

export const metadata = { title: "Plan del día · LifeOS" };

/** Plan del día en una hoja limpia para imprimir o guardar como PDF (sin menús). */
export default async function PrintPlanDay({ params }: PageProps<"/print/plan/[id]">) {
  const user = await pageUser();
  const { id } = await params;
  const d = await prisma.planDay.findFirst({ where: { id, userId: user.id }, include: { meso: { select: { code: true, name: true } } } });
  if (!d) notFound();
  const rm = await rmContext(user.id);
  const blocks = annotateKg(dayView(d).blocks, rm.rms, rm.aliases, rm.step);
  return (
    <main className="mx-auto max-w-3xl bg-white p-6 text-black print:p-0">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">{d.title}</h1>
          <p className="text-sm">
            {d.date ? formatDate(d.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : ""} · {d.meso.code} · {d.code}
            {d.durationMin ? ` · ~${d.durationMin} min` : ""}
          </p>
        </div>
        <PrintButton />
      </div>
      {blocks.map((b, i) =>
        b.kind === "table" ? (
          <table key={i} className="mb-4 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-black text-left">
                <th className="py-1 pr-2">Ejercicio</th>
                <th className="py-1 pr-2">Series</th>
                <th className="py-1 pr-2">Carga</th>
                <th className="py-1 pr-2">RIR</th>
                <th className="py-1 pr-2">Desc.</th>
                <th className="py-1">✓</th>
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, j) => (
                <tr key={j} className={r.ramp ? "border-b border-gray-300 text-gray-600" : "border-b border-gray-400"}>
                  <td className="py-1.5 pr-2">{r.ramp ? `↳ ${r.exercise}` : r.exercise}</td>
                  <td className="py-1.5 pr-2 whitespace-nowrap">{r.sets}</td>
                  <td className="py-1.5 pr-2">{r.kg ? `${r.load} · ${r.kg}` : r.load}</td>
                  <td className="py-1.5 pr-2">{r.rir}</td>
                  <td className="py-1.5 pr-2 whitespace-nowrap">{r.rest}</td>
                  <td className="py-1.5">□</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : b.kind === "why" ? null : (
          <section key={i} className="mb-3 text-sm">
            {b.title ? <h2 className="font-semibold">{b.title}</h2> : null}
            {b.text ? <p>{b.text}</p> : null}
          </section>
        ),
      )}
      <p className="mt-6 text-xs text-gray-500">LifeOS · Notas: ____________________________________________</p>
    </main>
  );
}
