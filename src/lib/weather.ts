/**
 * Condiciones meteorológicas de la pista (Open-Meteo: sin clave ni cuenta).
 * Solo se envían las coordenadas de la pista, nunca datos de la persona.
 * Sin red o si el servicio falla, devuelve null y la app sigue igual.
 */
export type Conditions = { tempC: number | null; windMs: number | null; windDirDeg: number | null; rainMm: number | null; at: string };
type Fetch = typeof fetch;

const BASE = "https://api.open-meteo.com/v1/forecast";

async function getJson(url: string, f: Fetch): Promise<unknown | null> {
  try {
    const res = await f(url, { signal: AbortSignal.timeout(5000), headers: { accept: "application/json" } });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** Condiciones a una hora concreta (fecha ISO y hora local de Madrid, 0–23) de los últimos 90 días u hoy. */
export async function conditionsAt(lat: number, lon: number, date: string, hour: number, f: Fetch = fetch): Promise<Conditions | null> {
  const url = `${BASE}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,precipitation&wind_speed_unit=ms&timezone=Europe%2FMadrid&start_date=${date}&end_date=${date}`;
  const j = (await getJson(url, f)) as { hourly?: { time?: string[]; temperature_2m?: number[]; wind_speed_10m?: number[]; wind_direction_10m?: number[]; precipitation?: number[] } } | null;
  const h = j?.hourly;
  if (!h?.time?.length) return null;
  const at = `${date}T${String(hour).padStart(2, "0")}:00`;
  const i = h.time.indexOf(at);
  if (i < 0) return null;
  const pick = (a?: number[]) => (a && typeof a[i] === "number" ? a[i] : null);
  return { tempC: pick(h.temperature_2m), windMs: pick(h.wind_speed_10m), windDirDeg: pick(h.wind_direction_10m), rainMm: pick(h.precipitation), at };
}

const g = globalThis as unknown as { __lifeosMaxTemp?: Map<string, { at: number; value: number | null }> };

/** Máxima prevista hoy en la pista (caché de 1 h en memoria). */
export async function todayMaxTemp(lat: number, lon: number, date: string, f: Fetch = fetch): Promise<number | null> {
  g.__lifeosMaxTemp ??= new Map();
  const key = `${lat.toFixed(2)},${lon.toFixed(2)},${date}`;
  const hit = g.__lifeosMaxTemp.get(key);
  if (hit && Date.now() - hit.at < 3600e3) return hit.value;
  const j = (await getJson(`${BASE}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&daily=temperature_2m_max&timezone=Europe%2FMadrid&start_date=${date}&end_date=${date}`, f)) as {
    daily?: { temperature_2m_max?: number[] };
  } | null;
  const value = typeof j?.daily?.temperature_2m_max?.[0] === "number" ? j.daily.temperature_2m_max[0] : null;
  g.__lifeosMaxTemp.set(key, { at: Date.now(), value });
  return value;
}
