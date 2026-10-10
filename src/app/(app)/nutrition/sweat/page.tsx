import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteButton, SweatForm } from "@/components/nutrition/planning";
import { pageUser } from "@/lib/auth/page";
import { today, toIsoDay } from "@/lib/dates";
import { formatDate, formatNum } from "@/lib/format";
import { listSweatTests } from "@/lib/nutrition/planning-service";

export const metadata = { title: "Tasa de sudoración · Atlenza" };

/** v1.7 · Tasa de sudoración: cuánto pierdes por hora y cuánto beber para no pasar del 2 %. */
export default async function SweatPage() {
  const user = await pageUser();
  const tests = await listSweatTests(user.id);
  return (
    <>
      <PageHeader title="Tasa de sudoración" description="Pésate antes y después de entrenar: sabrás cuánto sudas por hora y cuánto te conviene beber." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="h-fit gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">Nueva prueba</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <SweatForm today={toIsoDay(today())} />
          </CardContent>
        </Card>
        <Card className="h-fit gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">Tus pruebas</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 px-4 text-sm">
            {tests.length ? (
              <ul className="grid gap-2" aria-label="Pruebas de sudoración">
                {tests.map((t) => (
                  <li key={t.id} className="flex items-start justify-between gap-2 rounded-md border p-2">
                    <span>
                      <span className="font-medium tabular-nums">{formatNum(t.rateLh, 2)} L/h</span> · {formatDate(t.date, { day: "numeric", month: "short" })} · {t.minutes} min
                      {t.tempC != null ? ` · ${Math.round(t.tempC)} °C` : ""}
                      <span className="block text-xs text-muted-foreground">
                        Perdiste el {formatNum(t.lossPct, 1)} % del peso{t.overTwoPct ? " (más del 2 %: bebe más la próxima vez)" : ""}.{" "}
                        {t.drinkMlPerH ? `Para quedarte por debajo del 2 % en una sesión así: unos ${t.drinkMlPerH} ml por hora.` : "Con lo que bebiste te quedaste por debajo del 2 %."}
                      </span>
                    </span>
                    <DeleteButton url={`/api/nutrition/sweat/${t.id}`} label="Borrar prueba" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">Aún no hay pruebas. Repite con calor y con frío: la tasa cambia mucho.</p>
            )}
            <p className="text-xs text-muted-foreground">El 2 % es una referencia habitual en deporte, no una pauta médica. No bebas más de lo que pierdes.</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
