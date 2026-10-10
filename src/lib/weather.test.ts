import { describe, expect, it } from "vitest";

import { dayForecast, forecastTips } from "@/lib/weather";

describe("pronóstico de la competición", () => {
  it("lee el día de Open-Meteo", async () => {
    let url = "";
    const f = (async (u: string) => {
      url = u;
      return new Response(JSON.stringify({ daily: { time: ["2026-06-14"], temperature_2m_max: [31], temperature_2m_min: [18], precipitation_sum: [0], precipitation_probability_max: [10], wind_speed_10m_max: [3.2] } }));
    }) as unknown as typeof fetch;
    const fc = await dayForecast(39.47, -0.38, "2026-06-14", f);
    expect(url).toContain("latitude=39.4700");
    expect(fc).toEqual({ date: "2026-06-14", maxC: 31, minC: 18, rainMm: 0, rainProb: 10, windMaxMs: 3.2 });
    expect(forecastTips(fc!)).toEqual(["Gorra, crema solar y más agua de lo habitual"]);
  });
  it("sin red: null", async () => {
    const f = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await dayForecast(0, 0, "2026-01-01", f)).toBeNull();
  });
  it("lluvia, frío y viento", () => {
    expect(forecastTips({ date: "x", maxC: 12, minC: 5, rainMm: 4, rainProb: 80, windMaxMs: 9 })).toHaveLength(3);
  });
});
