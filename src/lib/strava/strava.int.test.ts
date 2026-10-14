// Integración (v1.10): Strava con BD real y la API de Strava simulada (OAuth, actividades y streams).
import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: async () => null }));

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("Strava v1.10 (BD real, API simulada)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let strava: typeof import("./service");
  let dataAi: typeof import("@/lib/ai/data-ai");
  let server: Server;
  let userId: string;
  const t = Date.now();
  const calls: string[] = [];
  let access = "acc-1";
  const day = (d: number) => new Date(Date.UTC(2026, 9, d, 7, 30)).toISOString().replace(".000", "");

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        calls.push(`${req.method} ${req.url}`);
        res.setHeader("content-type", "application/json");
        const url = req.url ?? "";
        if (url === "/oauth/token") {
          const b = JSON.parse(raw);
          if (b.client_secret !== "secreto-de-prueba-123") return (res.statusCode = 401), res.end("{}");
          access = b.grant_type === "refresh_token" ? "acc-2" : "acc-1";
          return res.end(JSON.stringify({ access_token: access, refresh_token: "ref-1", expires_at: b.grant_type === "refresh_token" ? Math.floor(Date.now() / 1000) + 3600 : Math.floor(Date.now() / 1000) - 10, athlete: { id: 4242 + (t % 1000) } }));
        }
        if (req.headers.authorization !== `Bearer ${access}`) return (res.statusCode = 401), res.end("{}");
        if (url.startsWith("/api/v3/athlete/activities")) {
          const page = Number(new URL(url, "http://x").searchParams.get("page"));
          return res.end(JSON.stringify(page > 1 ? [] : [
            { id: 11, name: "Rodaje suave", sport_type: "Run", start_date: day(6), elapsed_time: 2400, moving_time: 2300, distance: 7000, average_heartrate: 140, max_heartrate: 160 },
            { id: 10, name: "Bici", sport_type: "Ride", start_date: day(5), elapsed_time: 3600, distance: 30000 },
          ]));
        }
        if (url.startsWith("/api/v3/activities/")) return res.end(JSON.stringify({ time: { data: [0, 600, 1200] }, heartrate: { data: [130, 145, 150] } }));
        if (url === "/oauth/deauthorize") return res.end("{}");
        res.statusCode = 404;
        res.end("{}");
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    process.env.STRAVA_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    process.env.STRAVA_CLIENT_ID = "12345";
    process.env.STRAVA_CLIENT_SECRET = "secreto-de-prueba-123";
    process.env.AUTH_URL = "https://atlenza.test";
    process.env.AUTH_SECRET ??= "secreto-auth-de-prueba";
    process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    vi.resetModules();
    prisma = (await import("@/lib/prisma")).prisma;
    strava = await import("./service");
    dataAi = await import("@/lib/ai/data-ai");
    userId = (await prisma.user.create({ data: { email: `strava-${t}@test.dev` } })).id;
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { contains: `-${t}@test.dev` } } });
    server.close();
  });

  it("el enlace de permiso lleva un state firmado que solo vale para ese usuario y 10 minutos", () => {
    const url = new URL(strava.authorizeUrl(userId));
    expect(url.searchParams.get("redirect_uri")).toBe("https://atlenza.test/api/strava/callback");
    expect(url.searchParams.get("scope")).toBe("activity:read_all");
    const state = url.searchParams.get("state")!;
    expect(strava.checkState(state, userId)).toBe(true);
    expect(strava.checkState(state, "otro")).toBe(false);
    expect(strava.checkState(state, userId, Date.now() + 11 * 60_000)).toBe(false);
    expect(strava.checkState(state.replace(/.$/, "x"), userId)).toBe(false);
  });

  it("conecta (tokens cifrados), renueva el token caducado e importa sin duplicar", async () => {
    await expect(strava.connectStrava(userId, "code", "read", fetch)).rejects.toMatchObject({ status: 400 });
    await strava.connectStrava(userId, "code", "read,activity:read_all", fetch);
    const link = await prisma.stravaLink.findUniqueOrThrow({ where: { userId } });
    expect(link.tokenSealed).not.toContain("acc-1");
    const r = await strava.syncStrava(userId, { now: new Date(Date.UTC(2026, 9, 8)) });
    expect(r).toEqual({ imported: 2, skipped: 0 });
    expect(calls).toContain("POST /oauth/token"); // renovación (el primero ya venía caducado)
    const sessions = await prisma.trainingSession.findMany({ where: { userId }, orderBy: { date: "asc" }, include: { track: true } });
    expect(sessions.map((s) => [s.source, s.externalId, s.title])).toEqual([
      ["STRAVA", "strava:10", "Bici"],
      ["STRAVA", "strava:11", "Rodaje suave"],
    ]);
    expect(sessions[1].track).toMatchObject({ modality: "RUN", distanceM: 7000, hrAvg: 140 });
    expect(await strava.syncStrava(userId, { now: new Date(Date.UTC(2026, 9, 8)) })).toEqual({ imported: 0, skipped: 2 });
  });

  it("lo de Strava no va a la IA (ni la forma calculada con ello)", async () => {
    await prisma.trainingSession.create({ data: { userId, date: new Date(Date.UTC(2026, 9, 7)), type: "STRENGTH", status: "COMPLETED", durationSec: 3600, title: "Fuerza propia" } });
    const s = await dataAi.trainingSummary(userId, "2026-10-08");
    expect(s.semanas.reduce((a, w) => a + w.sesiones, 0)).toBe(1);
    expect(s.forma).toBeNull();
    // El mismo filtro que aplica la ruta de sesiones cuando quien mira es la entrenadora
    const { notFromStrava } = await import("./policy");
    expect((await prisma.trainingSession.findMany({ where: { userId, ...notFromStrava } })).map((x) => x.title)).toEqual(["Fuerza propia"]);
  });

  it("desconectar revoca el permiso y, si se pide, borra lo importado", async () => {
    const r = await strava.disconnectStrava(userId, true, fetch);
    expect(r).toEqual({ removed: true, deleted: 2 });
    expect(calls).toContain("POST /oauth/deauthorize");
    expect(await prisma.trainingSession.count({ where: { userId } })).toBe(1);
    expect(await prisma.stravaLink.findUnique({ where: { userId } })).toBeNull();
  });
});
