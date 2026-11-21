// v3.1 · Apple Fitness: token personal revocable, endpoint Bearer (idempotente, con límite) y bandeja (completar / aparte / descartar).
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { testStamp } from "@/test/stamp";

let current: { id: string; role: "ATHLETE" | "COACH" } = { id: "", role: "ATHLETE" };
vi.mock("@/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/session")>()), requireUser: async () => current }));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const DAY = "2026-10-07";
const run = (over: Record<string, unknown> = {}) => ({ type: "Correr", start: `${DAY}T08:30:00+02:00`, end: `${DAY}T09:15:00+02:00`, distanceKm: 7.2, kcal: 480, hrAvg: 148, hrMax: 171, ...over });

describe.skipIf(!HAS_DB)("Apple Fitness (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let a: string;
  let b: string;
  let ip = 0;
  const t = testStamp();
  const post = (body: unknown, token?: string, raw?: string) =>
    new NextRequest("http://localhost/api/training/apple-fitness", {
      method: "POST",
      body: raw ?? JSON.stringify(body),
      headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${(ip = (ip % 200) + 1)}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    });
  const resolveReq = (id: string, body: unknown) => new NextRequest(`http://localhost/api/training/apple-fitness/pending/${id}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
  const mk = (userId: string, o: Record<string, unknown> = {}) =>
    prisma.trainingSession.create({ data: { userId, date: new Date(`${DAY}T00:00:00Z`), type: "TRACK", status: "COMPLETED", durationSec: 2640, title: "Rodaje web", ...o } as never });

  beforeAll(async () => {
    process.env.AUTH_SECRET ??= "secreto-auth-de-prueba";
    prisma = (await import("@/lib/prisma")).prisma;
    a = (await prisma.user.create({ data: { email: `ap-a-${t}@test.dev`, name: "A" } })).id;
    // Con umbral de FC la carga sale por hrTSS (sin umbral ni RPE no hay TSS: ese caso es válido y distinto)
    await prisma.thresholdHistory.create({ data: { userId: a, effectiveFrom: new Date("2026-01-01T00:00:00Z"), hrMax: 190, hrRest: 50, lthr: 170 } });
    b = (await prisma.user.create({ data: { email: `ap-b-${t}@test.dev`, name: "B" } })).id;
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [a, b].filter(Boolean) } } });
  });

  describe("token", () => {
    it("se guarda solo el hash, uno activo por usuaria, y regenerar invalida el anterior", async () => {
      const svc = await import("./token-service");
      const t1 = await svc.createAppleToken(a);
      const row = await prisma.personalToken.findFirstOrThrow({ where: { userId: a } });
      expect(row.tokenHash).not.toContain(t1);
      expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect((await svc.userForAppleToken(t1))?.id).toBe(a);
      const t2 = await svc.createAppleToken(a);
      expect(await prisma.personalToken.count({ where: { userId: a } })).toBe(1);
      expect(await svc.userForAppleToken(t1)).toBeNull();
      expect((await svc.userForAppleToken(t2))?.id).toBe(a);
      expect((await svc.appleTokenStatus(a)).lastUsedAt).not.toBeNull();
      await svc.revokeAppleToken(a);
      expect(await svc.userForAppleToken(t2)).toBeNull();
      expect((await svc.appleTokenStatus(a)).active).toBe(false);
    });
    it("basura, token ajeno de otro propósito y cuenta con tratamiento limitado → null", async () => {
      const svc = await import("./token-service");
      expect(await svc.userForAppleToken("x")).toBeNull();
      const tok = await svc.createAppleToken(b);
      await prisma.user.update({ where: { id: b }, data: { processingRestrictedAt: new Date() } });
      expect(await svc.userForAppleToken(tok)).toBeNull();
      await expect(svc.createAppleToken(b)).rejects.toMatchObject({ status: 403 });
      await prisma.user.update({ where: { id: b }, data: { processingRestrictedAt: null } });
      expect((await svc.userForAppleToken(tok))?.id).toBe(b);
      await svc.revokeAppleToken(b);
    });
  });

  describe("endpoint POST /api/training/apple-fitness", () => {
    it("401 sin token, con token inventado o revocado; 200 con el válido; reenvío = duplicado", async () => {
      const { POST } = await import("@/app/api/training/apple-fitness/route");
      const { createAppleToken, revokeAppleToken } = await import("./token-service");
      expect((await POST(post(run()), undefined as never)).status).toBe(401);
      expect((await POST(post(run(), "a".repeat(43)), undefined as never)).status).toBe(401);
      const token = await createAppleToken(a);
      const ok = await POST(post(run(), token), undefined as never);
      expect(ok.status).toBe(200);
      expect(await ok.json()).toMatchObject({ received: 1, added: 1, duplicates: 0 });
      // Mismo entreno en otro idioma y con otro nombre: no duplica
      const again = await (await POST(post(run({ type: "Running", name: "Carrera" }), token), undefined as never)).json();
      expect(again).toMatchObject({ added: 0, duplicates: 1 });
      expect(await prisma.externalWorkout.count({ where: { userId: a } })).toBe(1);
      // Nada entra en el diario: solo en la bandeja
      expect(await prisma.trainingSession.count({ where: { userId: a } })).toBe(0);
      await revokeAppleToken(a);
      expect((await POST(post(run(), token), undefined as never)).status).toBe(401);
    });
    it("400 con JSON roto o datos fuera de rango; varios en una petición; los de otra usuaria no se mezclan", async () => {
      const { POST } = await import("@/app/api/training/apple-fitness/route");
      const { createAppleToken, revokeAppleToken } = await import("./token-service");
      const token = await createAppleToken(a);
      expect((await POST(post(null, token, "{no json"), undefined as never)).status).toBe(400);
      expect((await POST(post(run({ hrAvg: 999 }), token), undefined as never)).status).toBe(400);
      expect((await POST(post({ workouts: [] }, token), undefined as never)).status).toBe(400);
      const r = await (await POST(post({ workouts: [run({ start: `${DAY}T18:00:00+02:00`, end: `${DAY}T18:40:00+02:00`, type: "Remo" }), run({ start: `${DAY}T18:00:00+02:00`, end: `${DAY}T18:40:00+02:00`, type: "Rowing" })] }, token), undefined as never)).json();
      expect(r).toMatchObject({ received: 2, added: 1, duplicates: 1 });
      expect(await prisma.externalWorkout.count({ where: { userId: b } })).toBe(0);
      await revokeAppleToken(a);
    });
  });

  describe("bandeja", () => {
    const reset = async () => {
      await prisma.externalWorkout.deleteMany({ where: { userId: { in: [a, b] } } });
      await prisma.trainingSession.deleteMany({ where: { userId: { in: [a, b] } } });
    };
    const ingest = async (userId: string, over: Record<string, unknown> = {}) => {
      const { ingestWorkouts } = await import("./inbox-service");
      const { payloadSchema } = await import("./payload");
      await ingestWorkouts(userId, payloadSchema.parse(run(over)));
      return prisma.externalWorkout.findFirstOrThrow({ where: { userId }, orderBy: { receivedAt: "desc" } });
    };

    it("listPending compara con las sesiones propias de ese día (y solo esas)", async () => {
      await reset();
      const own = await mk(a);
      await mk(a, { title: "De Strava", source: "STRAVA", externalId: `strava:${t}` });
      await mk(b, { title: "Ajena" });
      await ingest(a);
      const { listPending } = await import("./inbox-service");
      const [p] = await listPending(a);
      expect(p.sessions.map((s) => s.id)).toEqual([own.id]);
      expect(p.sessions[0].rows.find((r) => r.field === "hrAvg")).toMatchObject({ web: null, watch: 148, willFill: true });
      expect(await listPending(b)).toEqual([]);
    });

    it("completar: rellena huecos, no pisa lo escrito, crea la parte de pista y recalcula la carga; no se resuelve dos veces", async () => {
      await reset();
      const own = await mk(a, { kcal: null, track: { create: { modality: "RUN", distanceM: 6500, hrZoneSeconds: [] } } });
      const w = await ingest(a);
      const { POST } = await import("@/app/api/training/apple-fitness/pending/[id]/route");
      current = { id: a, role: "ATHLETE" };
      const ctx = { params: Promise.resolve({ id: w.id }) } as never;
      const res = await POST(resolveReq(w.id, { action: "merge", sessionId: own.id }), ctx);
      expect(res.status).toBe(200);
      const s = await prisma.trainingSession.findUniqueOrThrow({ where: { id: own.id }, include: { track: true } });
      expect(s).toMatchObject({ source: null, durationSec: 2640, kcal: 480, title: "Rodaje web" });
      expect(s.track).toMatchObject({ distanceM: 6500, hrAvg: 148, hrMax: 171 }); // la distancia escrita a mano se conserva
      expect(s.tss).not.toBeNull();
      expect((await prisma.externalWorkout.findUniqueOrThrow({ where: { id: w.id } })).status).toBe("MERGED");
      expect((await POST(resolveReq(w.id, { action: "discard" }), ctx)).status).toBe(409);
      expect((await POST(resolveReq(w.id, { action: "import" }), ctx)).status).toBe(409);
    });

    it("completar una sesión planificada la marca como hecha; una de fuerza solo recibe kcal", async () => {
      await reset();
      const planned = await mk(a, { status: "PLANNED", durationSec: null, title: "Plan" });
      const w1 = await ingest(a);
      const { mergeWorkout } = await import("./inbox-service");
      await mergeWorkout(a, w1.id, planned.id);
      expect(await prisma.trainingSession.findUniqueOrThrow({ where: { id: planned.id } })).toMatchObject({ status: "COMPLETED", durationSec: 2700 });
      const str = await mk(a, { type: "STRENGTH", title: "Fuerza" });
      const w2 = await ingest(a, { start: `${DAY}T19:00:00+02:00`, end: `${DAY}T19:30:00+02:00` });
      await mergeWorkout(a, w2.id, str.id);
      const s = await prisma.trainingSession.findUniqueOrThrow({ where: { id: str.id }, include: { track: true } });
      expect(s.kcal).toBe(480);
      expect(s.track).toBeNull();
    });

    it("no se puede completar la sesión de otra usuaria, ni una de Strava, ni de otro día", async () => {
      await reset();
      const w = await ingest(a);
      const theirs = await mk(b);
      const strava = await mk(a, { source: "STRAVA", externalId: `strava:${t}:x` });
      const otherDay = await mk(a, { date: new Date("2026-10-08T00:00:00Z") });
      const { mergeWorkout } = await import("./inbox-service");
      for (const id of [theirs.id, strava.id, otherDay.id]) await expect(mergeWorkout(a, w.id, id)).rejects.toMatchObject({ status: 404 });
      expect((await prisma.externalWorkout.findUniqueOrThrow({ where: { id: w.id } })).status).toBe("PENDING");
      expect(await prisma.trainingSession.findUniqueOrThrow({ where: { id: theirs.id } })).toMatchObject({ kcal: null });
    });

    it("la usuaria B no resuelve el borrador de A (404) y A lo conserva pendiente", async () => {
      await reset();
      const w = await ingest(a);
      const mine = await mk(b);
      const svc = await import("./inbox-service");
      await expect(svc.discardWorkout(b, w.id)).rejects.toMatchObject({ status: 404 });
      await expect(svc.importWorkout(b, w.id)).rejects.toMatchObject({ status: 404 });
      await expect(svc.mergeWorkout(b, w.id, mine.id)).rejects.toMatchObject({ status: 404 });
      expect((await prisma.externalWorkout.findUniqueOrThrow({ where: { id: w.id } })).status).toBe("PENDING");
    });

    it("crear aparte: sesión APPLE_FITNESS (privada), con kcal, FC y carga; descartado no reaparece al reenviar", async () => {
      await reset();
      const w = await ingest(a);
      const svc = await import("./inbox-service");
      const r = await svc.importWorkout(a, w.id);
      const s = await prisma.trainingSession.findUniqueOrThrow({ where: { id: r.sessionId }, include: { track: true } });
      expect(s).toMatchObject({ userId: a, source: "APPLE_FITNESS", externalId: `apple:${w.dedupeKey}`, kcal: 480, title: "Correr", type: "TRACK", status: "COMPLETED" });
      expect(s.track).toMatchObject({ modality: "RUN", distanceM: 7200, hrAvg: 148, hrMax: 171 });
      expect(s.tss).not.toBeNull();
      expect((await prisma.externalWorkout.findUniqueOrThrow({ where: { id: w.id } })).sessionId).toBe(s.id);
      const w2 = await ingest(a, { start: `${DAY}T20:00:00+02:00`, end: `${DAY}T20:30:00+02:00` });
      await svc.discardWorkout(a, w2.id);
      await ingest(a, { start: `${DAY}T20:00:00+02:00`, end: `${DAY}T20:30:00+02:00` });
      expect(await prisma.externalWorkout.count({ where: { userId: a, status: "PENDING" } })).toBe(0);
    });

    it("editar una sesión aparte conserva su origen privado y editar cualquiera conserva kcal", async () => {
      await reset();
      const w = await ingest(a);
      const { importWorkout } = await import("./inbox-service");
      const { sessionId: id } = await importWorkout(a, w.id);
      const { updateTrainingSession } = await import("@/lib/training/service");
      await updateTrainingSession(a, id, { date: DAY, type: "MIXED", status: "COMPLETED", title: "Editada", durationSec: 3000, track: null, technical: null, strength: null } as never);
      expect(await prisma.trainingSession.findUniqueOrThrow({ where: { id } })).toMatchObject({ source: "APPLE_FITNESS", kcal: 480, title: "Editada" });
    });
  });
});
