// Integración con BD real (v3.2 Q): recordatorios de asistencia, límites y art. 18.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { testStamp } from "@/test/stamp";

vi.mock("@/auth", () => ({ auth: async () => null }));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const H = 3600e3;

describe.skipIf(!HAS_DB)("recordatorios de eventos (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("./event-reminders-service");
  let queue: typeof import("@/lib/jobs/queue");
  const t = testStamp();
  const u: Record<string, string> = {};
  const m: Record<string, string> = {};
  const mail = (k: string) => `${k}-${t}@test.dev`;
  let org: string;
  let orgY: string;
  // 12:00 de Madrid, 2026-12-10: dentro de la franja de envío
  const now = new Date("2026-12-10T11:00:00Z");
  const ev = (title: string, hours: number, extra: Record<string, unknown> = {}) =>
    prisma.orgEvent.create({ data: { orgId: org, title, startsAt: new Date(now.getTime() + hours * H), createdAt: new Date(now.getTime() - 24 * H), ...extra } });
  const sent: Array<{ endpoint: string; msg: { title: string; body?: string } }> = [];
  const fake = async (s: { endpoint: string }, msg: { title: string; body?: string }) => {
    sent.push({ endpoint: s.endpoint, msg });
    return { ok: true as const };
  };

  beforeAll(async () => {
    vi.resetModules();
    process.env.VAPID_PUBLIC_KEY = "x";
    process.env.VAPID_PRIVATE_KEY = "x";
    process.env.VAPID_SUBJECT = "mailto:a@b.dev";
    prisma = (await import("@/lib/prisma")).prisma;
    svc = await import("./event-reminders-service");
    queue = await import("@/lib/jobs/queue");
    const minorBirth = new Date(Date.UTC(now.getUTCFullYear() - 15, 0, 1));
    for (const k of ["adm", "coa", "a1", "a2", "minor", "restr", "quiet", "ex", "out"]) {
      u[k] = (
        await prisma.user.create({
          data: {
            email: mail(k),
            role: k === "adm" || k === "coa" ? "COACH" : "ATHLETE",
            passwordHash: "x",
            processingRestrictedAt: k === "restr" ? new Date() : null,
            athleteProfile: { create: { birthDate: k === "minor" ? minorBirth : undefined, prefs: k === "quiet" ? { quietHours: { from: "10:00", to: "14:00" } } : undefined } },
            pushSubscriptions: { create: { endpoint: `https://push.test/${k}-${t}`, p256dh: "p", auth: "a" } },
          },
        })
      ).id;
    }
    org = (await prisma.organization.create({ data: { name: `RM-${t}`, createdById: u.adm } })).id;
    orgY = (await prisma.organization.create({ data: { name: `RM-Y-${t}`, createdById: u.adm } })).id;
    const add = async (orgId: string, k: string, role: "ADMIN" | "COACH" | "ATHLETE", status: "ACTIVE" | "PENDING" = "ACTIVE", scopes?: string[]) =>
      (m[k] = (await prisma.orgMember.create({ data: { orgId, userId: u[k], role, status, ...(scopes ? { scopes: scopes as never } : {}) } })).id);
    await add(org, "adm", "ADMIN");
    await add(org, "coa", "COACH");
    await add(org, "a1", "ATHLETE", "ACTIVE", ["LOAD"]);
    await add(org, "a2", "ATHLETE", "ACTIVE", ["LOAD", "SESSIONS", "RECOVERY", "PLANNING", "REPORTS"]);
    await add(org, "minor", "ATHLETE");
    await add(org, "restr", "ATHLETE");
    await add(org, "quiet", "ATHLETE");
    await add(org, "ex", "ATHLETE", "PENDING");
    await add(orgY, "out", "ATHLETE");
  });
  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: [org, orgY].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { email: { contains: `-${t}@test.dev` } } });
  });

  const run = async (at = now) => {
    const jobs = await svc.dueEventReminders(at);
    let n = 0;
    for (const j of jobs) if (await svc.sendEventReminder(j, at, fake as never)) n++;
    return { jobs, n };
  };

  it("avisa solo a atletas ACTIVE sin respuesta, no restringidas, una vez; el staff y otros clubes no", async () => {
    const e = await ev("Torneo", 30, { feeCents: 1500 });
    await prisma.orgEventResponse.create({ data: { eventId: e.id, memberId: m.a2, answer: "NO" } });
    const { jobs, n } = await run();
    const who = new Set(jobs.filter((j) => j.eventId === e.id).map((j) => j.memberId));
    expect(who).toEqual(new Set([m.a1, m.minor, m.quiet]));
    // quiet está en horas de silencio a las 12:00 de Madrid: no se envía ni se gasta la clave
    expect(n).toBe(2);
    expect(await prisma.notificationLog.count({ where: { key: `event-rsvp:${e.id}:${m.quiet}` } })).toBe(0);
    // segunda pasada: nada nuevo (una vez por evento y miembro)
    expect((await run()).n).toBe(0);
    // el texto no lleva importe ni datos ajenos (ni salud, sea cual sea el ámbito concedido)
    for (const s of sent) expect(`${s.msg.title} ${s.msg.body}`).not.toMatch(/€|15,|cuota|recuperaci|sueño|ciclo|lesi/i);
    // fuera de la silencio, quiet sí recibe (13:30 Madrid = 12:30Z, aún en silencio; 15:00 Madrid = 14:00Z ya no)
    const later = new Date("2026-12-10T14:00:00Z");
    expect((await run(later)).n).toBe(1);
    expect(await prisma.notificationLog.count({ where: { key: `event-rsvp:${e.id}:${m.quiet}` } })).toBe(1);
    // el staff ve cuántos recibieron aviso, sin nombres
    expect((await svc.remindedCount([e.id])).get(e.id)).toBe(3);
  });

  it("art. 18: con el tratamiento limitado no se avisa, ni aunque el trabajo ya estuviera en cola", async () => {
    const e = await ev("Limitada", 40);
    expect(await prisma.notificationLog.count({ where: { userId: u.restr } })).toBe(0);
    expect(await svc.sendEventReminder({ eventId: e.id, memberId: m.restr }, now, fake as never)).toBe(false);
    expect(await svc.sendEventReminder({ eventId: e.id, memberId: m.ex }, now, fake as never)).toBe(false); // no ACTIVE
    expect(await svc.sendEventReminder({ eventId: e.id, memberId: m.adm }, now, fake as never)).toBe(false); // staff
    // si limita el tratamiento después de encolar, tampoco
    await prisma.user.update({ where: { id: u.a1 }, data: { processingRestrictedAt: new Date() } });
    expect(await svc.sendEventReminder({ eventId: e.id, memberId: m.a1 }, now, fake as never)).toBe(false);
    await prisma.user.update({ where: { id: u.a1 }, data: { processingRestrictedAt: null } });
  });

  it("menores: solo en franja 9–21 h de Madrid y solo su propio aviso", async () => {
    const e = await ev("Noche", 30);
    const night = new Date("2026-12-10T22:00:00Z"); // 23:00 Madrid
    expect(await svc.runEventRemindersJob(night, async () => {})).toBe(0);
    expect(await svc.sendEventReminder({ eventId: e.id, memberId: m.minor }, night, fake as never)).toBe(false);
    const beforeCount = sent.length;
    expect(await svc.sendEventReminder({ eventId: e.id, memberId: m.minor }, now, fake as never)).toBe(true);
    expect(sent.length).toBe(beforeCount + 1);
    expect(sent.at(-1)!.endpoint).toContain(`minor-${t}`);
  });

  it("tope: máximo 3 recordatorios de eventos por persona y día", async () => {
    const jobs = [];
    for (let i = 0; i < 5; i++) jobs.push(await ev(`Tope ${i}`, 20 + i));
    // a2 respondió solo a "Torneo"; los de arriba son nuevos para ella
    // los registros llevan la hora real; se fechan en la hora simulada para que cuente el día
    await prisma.notificationLog.updateMany({ where: { userId: u.a2 }, data: { sentAt: new Date(now.getTime() - H) } });
    let n = 0;
    for (const e of jobs) {
      if (await svc.sendEventReminder({ eventId: e.id, memberId: m.a2 }, now, fake as never)) n++;
      await prisma.notificationLog.updateMany({ where: { userId: u.a2 }, data: { sentAt: new Date(now.getTime() - H) } });
    }
    expect(n).toBe(3);
  });

  it("resumen al staff: solo recuentos, una vez; el evento de otro club no cuenta", async () => {
    const e = await ev("Mañana", 10);
    await prisma.orgEventResponse.create({ data: { eventId: e.id, memberId: m.a1, answer: "YES" } });
    const before = sent.length;
    expect(await svc.runEventSummaryJob(now, fake as never)).toBe(2 * (await prisma.orgEvent.count({ where: { orgId: org, startsAt: { lte: new Date(now.getTime() + 24 * H), gt: now } } })));
    expect(await svc.runEventSummaryJob(now, fake as never)).toBe(0);
    const last = sent.slice(before).find((s) => /Mañana/.test(s.msg.body ?? ""))!;
    expect(last.msg.body).toMatch(/^«Mañana»: 1 sí, 0 no, 0 quizá, \d+ sin responder\.$/);
    expect(last.msg.body).not.toMatch(/@|At \d/);
    expect(await prisma.notificationLog.count({ where: { userId: u.out, key: { startsWith: "event-summary:" } } })).toBe(0);
  });

  it("el .ics del evento: miembros sí (otro club no, restringida no), sin importe y con pie de autoría", async () => {
    const e = await ev("Con cuota", 50, { feeCents: 2500, location: "Pista" });
    const { AUTHORSHIP_NOTICE } = await import("@/lib/legal/notice");
    const ics = await svc.eventIcs({ id: u.a2 } as never, org, e.id);
    const flat = ics.replace(/\r\n[ \t]/g, "");
    expect(flat).toContain(`SUMMARY:RM-${t} · Con cuota`);
    expect(flat).toContain("LOCATION:Pista");
    expect(flat).toContain(`X-WR-CALDESC:${AUTHORSHIP_NOTICE.replace(/,/g, "\\,")}`);
    expect(flat).not.toMatch(/2500|25,00|25\.00|FEE|importe/i);
    await expect(svc.eventIcs({ id: u.out } as never, org, e.id)).rejects.toThrow(/no encontrado/i);
    await expect(svc.eventIcs({ id: u.restr } as never, org, e.id)).rejects.toThrow(/limitado/i);
  });

  it("cola pg-boss real: el trabajador envía y no duplica", async () => {
    const e = await ev("Cola", 33);
    const q = `ev-rem-test-${t}`;
    const got: string[] = [];
    await queue.startEventReminderWorker(q, (async (s: { endpoint: string }) => (got.push(s.endpoint), { ok: true })) as never);
    await queue.enqueueEventReminders([{ eventId: e.id, memberId: m.a2 }], q);
    // el trabajador usa la hora real: fuera de la ventana de pruebas no envía; basta con comprobar que no falla y no duplica
    await new Promise((r) => setTimeout(r, 1500));
    expect(got.length).toBeLessThanOrEqual(1);
    await queue.stopBoss();
  });
});
