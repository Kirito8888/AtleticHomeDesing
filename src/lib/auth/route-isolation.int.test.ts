// v3.0 R (V3-S08): aislamiento sistemático entre cuentas en las rutas con id o `athleteId`.
// Hermano de `scope-isolation.int.test.ts` (mismo mock de `requireUser`).
//
// 1) Inventario vigilado: toda ruta de /api con segmento dinámico está en UNA lista (probada aquí, probada en otro fichero,
//    excluida con motivo o PENDIENTE). Una ruta nueva sin clasificar falla; quitar de PENDIENTE solo se hace probándola aquí.
// 2) Matriz negativa: la usuaria B llama con el id de un recurso de A a cada método exportado → 403/404 y el recurso de A no cambia.
// 3) Actores: entrenadora sin vínculo, con vínculo revocado o pendiente, ADMIN global sin vínculo y staff de otro club → 403/404.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { testStamp } from "@/test/stamp";

let current: { id: string; role: "ATHLETE" | "COACH" | "ADMIN" } = { id: "", role: "ATHLETE" };
vi.mock("@/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/session")>()), requireUser: async () => current }));

const LOAD: Record<string, () => Promise<unknown>> = {
  "tasks/[id]": () => import("@/app/api/tasks/[id]/route"),
  "goals/[id]": () => import("@/app/api/goals/[id]/route"),
  "habits/[id]": () => import("@/app/api/habits/[id]/route"),
  "finance/accounts/[id]": () => import("@/app/api/finance/accounts/[id]/route"),
  "recovery/injuries/[id]": () => import("@/app/api/recovery/injuries/[id]/route"),
  "training/sessions/[id]": () => import("@/app/api/training/sessions/[id]/route"),
  "training/sessions/[id]/comments": () => import("@/app/api/training/sessions/[id]/comments/route"),
  "planning/cycles/[id]": () => import("@/app/api/planning/cycles/[id]/route"),
  "planning/events/[id]": () => import("@/app/api/planning/events/[id]/route"),
  "study/modules/[id]": () => import("@/app/api/study/modules/[id]/route"),
  "training/apple-fitness/pending/[id]": () => import("@/app/api/training/apple-fitness/pending/[id]/route"),
  "recovery/apple-health/conflicts/[id]": () => import("@/app/api/recovery/apple-health/conflicts/[id]/route"),
};
const SESSION_BODY = { date: "2026-10-05", type: "MIXED", status: "COMPLETED", durationSec: 600, sessionRpe: 3, title: "HACKEADA" };
const HAS_DB = Boolean(process.env.DATABASE_URL);

/** Rutas dinámicas probadas en este fichero (matriz y actores). */
const TESTED_HERE = [
  "tasks/[id]", "goals/[id]", "habits/[id]", "finance/accounts/[id]", "recovery/injuries/[id]", "training/sessions/[id]",
  "training/sessions/[id]/comments", "planning/cycles/[id]", "planning/events/[id]", "study/modules/[id]",
  "clubs/[id]/members/[memberId]", "clubs/[id]/fees/[feeId]", "training/apple-fitness/pending/[id]",
  "recovery/apple-health/conflicts/[id]",
  "clubs/[id]/events/[eventId]", "clubs/[id]/events/[eventId]/response", "clubs/[id]/events/[eventId]/ics",
];
/** Rutas con prueba negativa en otro fichero (ruta o servicio). */
const TESTED_ELSEWHERE = [
  /^ai-plan\//, /^ai\/flashcards\//, /^ai\/study\/pack\//, /^account\/passkeys\//, /^finance\/(receipts|transactions|trips)\//,
  /^recovery\/(injuries\/\[id\]\/photos|photos|physio)/, /^training\/(reference-curves|exercises)\//, /^planning\/(manual\/day|plan\/day)/,
  /^study\/(modules\/\[id\]\/documents|quest-progress|self-test-history|topics)/, /^trash\//, /^safety\/contacts\//, /^clubs\/\[id\]\/(fees|members|events)$/,
];
/** Sin vínculo con una cuenta (token, lista cerrada, solo ADMIN o gestionada por Auth.js). */
const EXCLUDED = [/^admin\//, /^auth\//, /^calendar\/ics\//, /^report\/\[token\]$/, /^shared\/health\//, /^export\//];
/** PENDIENTES: filas propias del tipo `where: { id, userId }`; siguen sin caso en la matriz. Se reducen, no crecen. */
const PENDING = [
  /^coach\/links\//, /^ai\/(documents|study\/threads)\//, /^habits\/\[id\]\/toggle$/, /^finance\/(budgets|category-rules|deadlines|price-changes|subscriptions)\//, /^health\/reports\//,
  /^nutrition\//, /^planning\/(manual\/\[code\]|plan\/\[code\])/, /^recovery\/(appointments|body|injuries\/\[id\]\/protocol|supplements|wellbeing)/,
  /^reports\//, /^routine\//, /^study\/(assignments|classes|exam-plan|grades|sessions|modules\/\[id\]\/(exam-format|plan|topics))/,
  /^training\/(equipment|minimums|prehab|rm|templates|tests|sessions\/\[id\]\/(move|reschedule))/,
];

function dynamicRoutes(dir = join(process.cwd(), "src/app/api"), rel = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return dynamicRoutes(join(dir, e.name), rel ? `${rel}/${e.name}` : e.name);
    return e.name === "route.ts" && rel.includes("[") ? [rel] : [];
  });
}

describe("inventario de rutas con id", () => {
  it("toda ruta dinámica está clasificada (probada, excluida o pendiente)", () => {
    const unclassified = dynamicRoutes().filter(
      (r) => !TESTED_HERE.includes(r) && ![...TESTED_ELSEWHERE, ...EXCLUDED, ...PENDING].some((re) => re.test(r)),
    );
    expect(unclassified, "Ruta nueva con id sin clasificar en route-isolation.int.test.ts").toEqual([]);
  });
  it("las rutas probadas aquí existen", () => {
    const all = dynamicRoutes();
    for (const r of TESTED_HERE) expect(all, r).toContain(r);
  });
});

describe.skipIf(!HAS_DB)("usuaria B contra recursos de A (BD real)", () => {
  type Prisma = typeof import("@/lib/prisma").prisma;
  let prisma: Prisma;
  const t = testStamp();
  const day = new Date(Date.UTC(2026, 9, 5));
  const U: Record<string, string> = {};
  const R: Record<string, string> = {};
  let orgX: string;
  let orgY: string;
  let memberX: string;
  let feeX: string;

  const req = (path: string, method: string, body?: unknown) =>
    new NextRequest(new URL(path, "http://localhost:3000"), { method, headers: { "content-type": "application/json", origin: "http://localhost:3000" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const ctx = (p: Record<string, string>) => ({ params: Promise.resolve(p) }) as never;
  const as = (k: string, role: "ATHLETE" | "COACH" | "ADMIN" = "ATHLETE") => void (current = { id: U[k], role });

  beforeAll(async () => {
    process.env.AUTH_URL = "http://localhost:3000";
    prisma = (await import("@/lib/prisma")).prisma;
    const mk = async (k: string, role: "ATHLETE" | "COACH" | "ADMIN" = "ATHLETE") => void (U[k] = (await prisma.user.create({ data: { email: `ri-${k}-${t}@test.dev`, name: `RI ${k}`, role, passwordHash: "x" } })).id);
    for (const k of ["a", "b"]) await mk(k);
    for (const k of ["coachNone", "coachRevoked", "coachPending", "staffY", "staffX"]) await mk(k, "COACH");
    await mk("admin", "ADMIN");
    const a = U.a;
    R.task = (await prisma.task.create({ data: { userId: a, title: "RI-TAREA" } })).id;
    R.goal = (await prisma.goal.create({ data: { userId: a, kind: "CUSTOM", title: "RI-META", target: 10 } })).id;
    R.habit = (await prisma.habit.create({ data: { userId: a, name: "RI-HABITO" } })).id;
    R.account = (await prisma.financialAccount.create({ data: { userId: a, name: "RI-CUENTA", type: "ASSET" } })).id;
    R.injury = (await prisma.injury.create({ data: { userId: a, area: "KNEE", pain: 2, startedOn: day } })).id;
    R.session = (await prisma.trainingSession.create({ data: { userId: a, date: day, type: "STRENGTH", status: "COMPLETED", durationSec: 3600, sessionRpe: 5, title: "RI-SESION" } })).id;
    R.stravaSession = (await prisma.trainingSession.create({ data: { userId: a, date: day, type: "TRACK", status: "COMPLETED", durationSec: 3000, sessionRpe: 6, title: "RI-STRAVA", source: "STRAVA", externalId: `strava:ri-${t}` } })).id;
    R.apple = (await prisma.externalWorkout.create({ data: { userId: a, source: "APPLE_FITNESS", dedupeKey: `ri-${t}`, date: day, startedAt: day, activityName: "RI-APPLE", modality: "RUN", durationSec: 1800 } })).id;
    R.health = (await prisma.healthSyncConflict.create({ data: { userId: a, date: day, metric: "RESTING_HR", currentValue: 50, incomingValue: 60 } })).id;
    R.comment = (await prisma.sessionComment.create({ data: { sessionId: R.session, athleteId: a, authorId: a, body: "RI-COMENTARIO" } })).id;
    R.cycle = (await prisma.trainingCycle.create({ data: { userId: a, level: "MESO", name: "RI-CICLO", startDate: day, endDate: new Date(Date.UTC(2026, 10, 5)) } })).id;
    R.event = (await prisma.calendarEvent.create({ data: { userId: a, type: "COMPETITION", title: "RI-EVENTO", startAt: day, priority: "A" } })).id;
    R.module = (await prisma.studyModule.create({ data: { userId: a, name: "RI-ASIGNATURA" } })).id;
    // vínculos de actores sobre A
    await prisma.coachAthlete.create({ data: { coachId: U.coachRevoked, athleteId: a, status: "REVOKED", scopes: ["SESSIONS", "LOAD", "PLANNING", "REPORTS"], canPlan: true } });
    await prisma.coachAthlete.create({ data: { coachId: U.coachPending, athleteId: a, status: "PENDING", scopes: ["SESSIONS", "LOAD", "PLANNING", "REPORTS"], canPlan: true } });
    // dos clubes: A es atleta del X; staffX administra X y staffY administra Y
    orgX = (await prisma.organization.create({ data: { name: `RI-X-${t}`, createdById: U.staffX } })).id;
    orgY = (await prisma.organization.create({ data: { name: `RI-Y-${t}`, createdById: U.staffY } })).id;
    await prisma.orgMember.create({ data: { orgId: orgX, userId: U.staffX, role: "ADMIN", status: "ACTIVE" } });
    await prisma.orgMember.create({ data: { orgId: orgY, userId: U.staffY, role: "ADMIN", status: "ACTIVE" } });
    memberX = (await prisma.orgMember.create({ data: { orgId: orgX, userId: a, role: "ATHLETE", status: "ACTIVE" } })).id;
    feeX = (await prisma.orgFee.create({ data: { orgId: orgX, memberId: memberX, concept: "RI-CUOTA", amountCents: 1000, dueDate: day } })).id;
  });
  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: [orgX, orgY].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(U) } } });
  });

  // ruta → { params, query, bodies por método }
  const CASES: Array<{ route: string; url: () => string; params: () => Record<string, string>; bodies?: Record<string, unknown> }> = [
    { route: "tasks/[id]", url: () => `/api/tasks/${R.task}`, params: () => ({ id: R.task }), bodies: { PATCH: { title: "HACKEADA" } } },
    { route: "goals/[id]", url: () => `/api/goals/${R.goal}`, params: () => ({ id: R.goal }), bodies: { PATCH: { title: "HACKEADA" } } },
    { route: "habits/[id]", url: () => `/api/habits/${R.habit}`, params: () => ({ id: R.habit }), bodies: { PATCH: { name: "HACKEADA" } } },
    { route: "finance/accounts/[id]", url: () => `/api/finance/accounts/${R.account}`, params: () => ({ id: R.account }), bodies: { PATCH: { isArchived: true } } },
    { route: "recovery/injuries/[id]", url: () => `/api/recovery/injuries/${R.injury}`, params: () => ({ id: R.injury }), bodies: { PATCH: { pain: 9 } } },
    { route: "training/sessions/[id]", url: () => `/api/training/sessions/${R.session}`, params: () => ({ id: R.session }), bodies: { PATCH: SESSION_BODY } },
    { route: "training/sessions/[id]/comments", url: () => `/api/training/sessions/${R.session}/comments?commentId=${R.comment}`, params: () => ({ id: R.session }), bodies: { POST: { body: "HACKEADO" } } },
    { route: "planning/cycles/[id]", url: () => `/api/planning/cycles/${R.cycle}`, params: () => ({ id: R.cycle }), bodies: { PATCH: { name: "HACKEADA" } } },
    { route: "planning/events/[id]", url: () => `/api/planning/events/${R.event}`, params: () => ({ id: R.event }), bodies: { PATCH: { lat: 40, lon: -3 } } },
    { route: "study/modules/[id]", url: () => `/api/study/modules/${R.module}`, params: () => ({ id: R.module }), bodies: { PATCH: { name: "HACKEADA" } } },
    // v3.1 · bandeja de Apple Fitness: solo la dueña (ni con ?athleteId); POST merge/import/discard
    { route: "training/apple-fitness/pending/[id]", url: () => `/api/training/apple-fitness/pending/${R.apple}`, params: () => ({ id: R.apple }), bodies: { POST: { action: "discard" } } },
    { route: "recovery/apple-health/conflicts/[id]", url: () => `/api/recovery/apple-health/conflicts/${R.health}`, params: () => ({ id: R.health }), bodies: { POST: { keep: "incoming" } } },
  ];
  const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

  for (const c of CASES) {
    it(`${c.route}: la usuaria B no lee ni cambia lo de A (404, y con ?athleteId=A, 403)`, async () => {
      const mod = (await LOAD[c.route]()) as Record<string, (r: NextRequest, x: never) => Promise<Response>>;
      const methods = METHODS.filter((m) => typeof mod[m] === "function");
      expect(methods.length, c.route).toBeGreaterThan(0);
      as("b");
      for (const m of methods) {
        for (const withAthlete of [false, true]) {
          const sep = c.url().includes("?") ? "&" : "?";
          const url = withAthlete ? `${c.url()}${sep}athleteId=${U.a}` : c.url();
          const res = await mod[m](req(url, m, c.bodies?.[m] ?? (m === "GET" || m === "DELETE" ? undefined : {})), ctx(c.params()));
          expect([403, 404], `${m} ${c.route}${withAthlete ? " con athleteId" : ""} → ${res.status}`).toContain(res.status);
        }
      }
    });
  }

  it("lo de A sigue intacto tras la batería de B", async () => {
    expect((await prisma.task.findUnique({ where: { id: R.task } }))?.title).toBe("RI-TAREA");
    expect((await prisma.goal.findUnique({ where: { id: R.goal } }))?.title).toBe("RI-META");
    expect((await prisma.habit.findUnique({ where: { id: R.habit } }))?.name).toBe("RI-HABITO");
    expect((await prisma.financialAccount.findUnique({ where: { id: R.account } }))?.name).toBe("RI-CUENTA");
    expect((await prisma.injury.findUnique({ where: { id: R.injury } }))?.pain).toBe(2);
    expect((await prisma.trainingSession.findUnique({ where: { id: R.session } }))?.title).toBe("RI-SESION");
    expect((await prisma.sessionComment.findUnique({ where: { id: R.comment } }))?.body).toBe("RI-COMENTARIO");
    expect((await prisma.trainingCycle.findUnique({ where: { id: R.cycle } }))?.name).toBe("RI-CICLO");
    expect((await prisma.calendarEvent.findUnique({ where: { id: R.event } }))?.title).toBe("RI-EVENTO");
    expect((await prisma.studyModule.findUnique({ where: { id: R.module } }))?.name).toBe("RI-ASIGNATURA");
    expect((await prisma.externalWorkout.findUnique({ where: { id: R.apple } }))?.status).toBe("PENDING");
    expect((await prisma.healthSyncConflict.findUnique({ where: { id: R.health } }))?.status).toBe("PENDING");
  });

  it("sesiones: entrenadora sin vínculo, revocada, pendiente, ADMIN global y staff de otro club → 403 (lectura y escritura)", async () => {
    const mod = await import("@/app/api/training/sessions/[id]/route");
    const sessionBody = SESSION_BODY;
    const actors: Array<[string, "COACH" | "ADMIN"]> = [["coachNone", "COACH"], ["coachRevoked", "COACH"], ["coachPending", "COACH"], ["admin", "ADMIN"], ["staffY", "COACH"]];
    for (const [k, role] of actors) {
      as(k, role);
      const u = `/api/training/sessions/${R.session}?athleteId=${U.a}`;
      for (const [m, body] of [["GET", undefined], ["PATCH", sessionBody], ["DELETE", undefined]] as const) {
        const res = await mod[m](req(u, m, body), ctx({ id: R.session }));
        expect(res.status, `${k} ${m}`).toBe(403);
      }
      const comments = await import("@/app/api/training/sessions/[id]/comments/route");
      expect((await comments.POST(req(`/api/training/sessions/${R.session}/comments?athleteId=${U.a}`, "POST", { body: "x" }), ctx({ id: R.session }))).status, `${k} comentar`).toBe(403);
    }
    expect((await prisma.trainingSession.findUnique({ where: { id: R.session } }))?.title).toBe("RI-SESION");
  });

  it("una entrenadora con SESSIONS y canPlan no lee, edita ni borra lo importado de Strava (404) y editar lo propio conserva su origen", async () => {
    const coach = (await prisma.user.create({ data: { email: `ri-cp-${t}@test.dev`, role: "COACH", passwordHash: "x" } })).id;
    U.coachPlan = coach;
    await prisma.coachAthlete.create({ data: { coachId: coach, athleteId: U.a, status: "ACTIVE", scopes: ["SESSIONS"], canPlan: true } });
    const mod = await import("@/app/api/training/sessions/[id]/route");
    as("coachPlan", "COACH");
    const u = `/api/training/sessions/${R.stravaSession}?athleteId=${U.a}`;
    expect((await mod.GET(req(u, "GET"), ctx({ id: R.stravaSession }))).status).toBe(404);
    expect((await mod.PATCH(req(u, "PATCH", SESSION_BODY), ctx({ id: R.stravaSession }))).status).toBe(404);
    expect((await mod.DELETE(req(u, "DELETE"), ctx({ id: R.stravaSession }))).status).toBe(404);
    const kept = await prisma.trainingSession.findUnique({ where: { id: R.stravaSession } });
    expect(kept?.title).toBe("RI-STRAVA");
    // la dueña edita su sesión importada: sigue siendo de Strava (privada)
    as("a");
    const own = await mod.PATCH(req(`/api/training/sessions/${R.stravaSession}`, "PATCH", { ...SESSION_BODY, title: "RI-STRAVA-2" }), ctx({ id: R.stravaSession }));
    expect(own.status, await own.clone().text()).toBe(200);
    const after = await prisma.trainingSession.findUnique({ where: { id: R.stravaSession } });
    expect([after?.source, after?.externalId]).toEqual(["STRAVA", `strava:ri-${t}`]);
  });

  it("un ciclo ajeno no se enlaza a una sesión propia (400)", async () => {
    const { POST } = await import("@/app/api/training/sessions/route");
    as("b");
    const res = await POST(req("/api/training/sessions", "POST", { date: "2026-10-06", type: "MIXED", status: "COMPLETED", durationSec: 600, sessionRpe: 3, cycleId: R.cycle }), undefined as never);
    expect(res.status).toBe(400);
  });

  it("clubes: el staff de otro club no toca miembros ni cuotas de este (404) y la atleta no se asciende a sí misma", async () => {
    const m = await import("@/app/api/clubs/[id]/members/[memberId]/route");
    const f = await import("@/app/api/clubs/[id]/fees/[feeId]/route");
    as("staffY", "COACH");
    expect((await m.PATCH(req(`/api/clubs/${orgY}/members/${memberX}`, "PATCH", { role: "COACH" }), ctx({ id: orgY, memberId: memberX }))).status).toBe(404);
    expect((await m.DELETE(req(`/api/clubs/${orgY}/members/${memberX}`, "DELETE"), ctx({ id: orgY, memberId: memberX }))).status).toBe(404);
    expect((await f.PATCH(req(`/api/clubs/${orgY}/fees/${feeX}`, "PATCH", { status: "PAID" }), ctx({ id: orgY, feeId: feeX }))).status).toBe(404);
    // y con el id del club ajeno (X) sin ser de él
    expect([403, 404]).toContain((await m.PATCH(req(`/api/clubs/${orgX}/members/${memberX}`, "PATCH", { role: "COACH" }), ctx({ id: orgX, memberId: memberX }))).status);
    as("a");
    expect([403, 404, 400]).toContain((await m.PATCH(req(`/api/clubs/${orgX}/members/${memberX}`, "PATCH", { role: "ADMIN" }), ctx({ id: orgX, memberId: memberX }))).status);
    expect((await prisma.orgMember.findUnique({ where: { id: memberX } }))?.role).toBe("ATHLETE");
    expect((await prisma.orgFee.findUnique({ where: { id: feeX } }))?.status).toBe("PENDING");
  });

  it("clubes (v3.2 P): eventos y respuestas de un club no se tocan desde otro (404)", async () => {
    const list = await import("@/app/api/clubs/[id]/events/route");
    const one = await import("@/app/api/clubs/[id]/events/[eventId]/route");
    const resp = await import("@/app/api/clubs/[id]/events/[eventId]/response/route");
    const icsR = await import("@/app/api/clubs/[id]/events/[eventId]/ics/route");
    const soon = new Date(Date.now() + 2 * 864e5);
    const evX = (await prisma.orgEvent.create({ data: { orgId: orgX, title: "RI-EVENTO", startsAt: soon } })).id;
    as("staffY", "COACH");
    for (const org of [orgX]) {
      expect((await list.GET(req(`/api/clubs/${org}/events`, "GET"), ctx({ id: org }))).status).toBe(404);
      expect((await list.POST(req(`/api/clubs/${org}/events`, "POST", { title: "x", startsAt: "2030-01-01T10:00" }), ctx({ id: org }))).status).toBe(404);
      expect((await resp.PUT(req(`/api/clubs/${org}/events/${evX}/response`, "PUT", { answer: "YES" }), ctx({ id: org, eventId: evX }))).status).toBe(404);
    }
    expect((await icsR.GET(req(`/api/clubs/${orgX}/events/${evX}/ics`, "GET"), ctx({ id: orgX, eventId: evX }))).status).toBe(404);
    // evento de X con el id del club propio (Y): tampoco
    expect((await icsR.GET(req(`/api/clubs/${orgY}/events/${evX}/ics`, "GET"), ctx({ id: orgY, eventId: evX }))).status).toBe(404);
    expect((await one.PATCH(req(`/api/clubs/${orgY}/events/${evX}`, "PATCH", { title: "hack" }), ctx({ id: orgY, eventId: evX }))).status).toBe(404);
    expect((await one.DELETE(req(`/api/clubs/${orgY}/events/${evX}`, "DELETE"), ctx({ id: orgY, eventId: evX }))).status).toBe(404);
    expect((await resp.PUT(req(`/api/clubs/${orgY}/events/${evX}/response`, "PUT", { answer: "YES" }), ctx({ id: orgY, eventId: evX }))).status).toBe(404);
    // la atleta del club no edita ni borra (solo staff), pero sí descarga su .ics
    as("a");
    const okIcs = await icsR.GET(req(`/api/clubs/${orgX}/events/${evX}/ics`, "GET"), ctx({ id: orgX, eventId: evX }));
    expect(okIcs.status).toBe(200);
    expect(await okIcs.text()).toContain("BEGIN:VEVENT");
    expect((await one.PATCH(req(`/api/clubs/${orgX}/events/${evX}`, "PATCH", { title: "hack" }), ctx({ id: orgX, eventId: evX }))).status).toBe(404);
    expect((await one.DELETE(req(`/api/clubs/${orgX}/events/${evX}`, "DELETE"), ctx({ id: orgX, eventId: evX }))).status).toBe(404);
    expect((await resp.PUT(req(`/api/clubs/${orgX}/events/${evX}/response`, "PUT", { answer: "YES" }), ctx({ id: orgX, eventId: evX }))).status).toBe(200);
    expect(await prisma.orgEvent.findUnique({ where: { id: evX } })).toMatchObject({ title: "RI-EVENTO" });
  });
});
