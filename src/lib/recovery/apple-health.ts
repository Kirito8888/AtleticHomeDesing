// Apple Health (export.xml) → sueño y FC en reposo por día (v1.6). Puro y por trozos:
// el fichero se lee en el navegador y solo se envían los totales diarios.
// La VFC de Apple es SDNN, no rMSSD: no se mezcla con la de LifeOS.

export type DayAgg = { date: string; sleepMin: number; restingHr: number | null };
export type AppleState = { buf: string; days: Map<string, { sleepMin: number; rhr: number[] }>; records: number };

export const newAppleState = (): AppleState => ({ buf: "", days: new Map(), records: 0 });

const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1] ?? null;
/** «2026-10-08 07:12:00 +0200» → milisegundos (respetando el desfase). */
function toMs(s: string): number {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/.exec(s.trim());
  return m ? Date.parse(`${m[1]}T${m[2]}${m[3]}:${m[4]}`) : NaN;
}

/** Procesa un trozo de texto; los registros cortados entre trozos se completan con el siguiente. */
export function feedApple(st: AppleState, chunk: string, from: string | null = null): void {
  st.buf += chunk;
  let end = 0;
  const re = /<Record\b[^>]*?\/?>/g;
  for (let m = re.exec(st.buf); m; m = re.exec(st.buf)) {
    end = re.lastIndex;
    const tag = m[0];
    const type = attr(tag, "type");
    if (type !== "HKCategoryTypeIdentifierSleepAnalysis" && type !== "HKQuantityTypeIdentifierRestingHeartRate") continue;
    const endDate = attr(tag, "endDate");
    if (!endDate) continue;
    const day = endDate.slice(0, 10); // el sueño cuenta para el día en que te despiertas
    if (from && day < from) continue;
    st.records++;
    const d = st.days.get(day) ?? { sleepMin: 0, rhr: [] };
    if (type === "HKCategoryTypeIdentifierSleepAnalysis") {
      // Solo fases de sueño («Asleep…»), no «InBed» ni «Awake»
      if (/Asleep/.test(attr(tag, "value") ?? "")) {
        const mins = (toMs(endDate) - toMs(attr(tag, "startDate") ?? "")) / 60000;
        if (mins > 0 && mins < 24 * 60) d.sleepMin += mins;
      }
    } else {
      const v = Number(attr(tag, "value"));
      if (v >= 25 && v <= 150) d.rhr.push(v);
    }
    st.days.set(day, d);
  }
  // Conserva solo lo que pueda ser el principio de un registro sin cerrar
  const rest = st.buf.slice(end);
  const open = rest.lastIndexOf("<Record");
  st.buf = open >= 0 ? rest.slice(open) : rest.slice(-20);
}

/** Días con datos (sueño hasta 16 h; FC en reposo = media del día). */
export function appleDays(st: AppleState): DayAgg[] {
  return [...st.days]
    .map(([date, d]) => ({
      date,
      sleepMin: Math.round(Math.min(d.sleepMin, 16 * 60)),
      restingHr: d.rhr.length ? Math.round(d.rhr.reduce((a, b) => a + b, 0) / d.rhr.length) : null,
    }))
    .filter((d) => d.sleepMin > 0 || d.restingHr != null)
    .sort((a, b) => a.date.localeCompare(b.date));
}
