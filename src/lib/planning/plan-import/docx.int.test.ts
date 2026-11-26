// Integración con BD real (v3.3): importar un Word de mesociclo en la ficha de una atleta sin cuenta.
import { strToU8, zipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { testStamp } from "@/test/stamp";

vi.mock("@/auth", () => ({ auth: async () => null }));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const p = (t: string) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
const tbl = (rows: string[][]) => `<w:tbl>${rows.map((r) => `<w:tr>${r.map((c) => `<w:tc>${p(c)}</w:tc>`).join("")}</w:tr>`).join("")}</w:tbl>`;
const HEAD = ["Ejercicio", "Series", "Reps", "RIR", "Desc.", "Tempo"];
const body = [
  p("Mesociclo 7 · 2 semanas · Hipertrofia"),
  tbl([["Nombre:", "Persona Ficticia"], ["Inicio:", "Lunes 07/12/2026"], ["Días:", "unos 60 min"]]),
  p("Cómo leer tu plan"), p("Texto de ayuda."),
  tbl([["SEMANA 1", "Bloque 1", "CARGA · 07/12-11/12"]]),
  p("LUNES 07/12 · Día A"), tbl([HEAD, ["Prensa", "3", "8-10", "2", "2:00", "3-0-1-0"]]),
  p("MIÉRCOLES 09/12 · Día B"), tbl([HEAD, ["Remo", "3", "8-10", "2", "2:00", "3-0-1-0"]]),
].join("");
const bytes = () => zipSync({ "word/document.xml": strToU8(`<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`) });

describe.skipIf(!HAS_DB)("importar Word en una ficha (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let files: typeof import("./files");
  let service: typeof import("./service");
  let session: typeof import("@/lib/auth/session");
  let managed: typeof import("@/lib/managed/service");
  const t = testStamp();
  const ids: string[] = [];
  let owner: { id: string; role: "COACH" };
  let other: { id: string; role: "COACH" };
  let ficha: string;

  beforeAll(async () => {
    vi.resetModules();
    prisma = (await import("@/lib/prisma")).prisma;
    files = await import("./files");
    service = await import("./service");
    session = await import("@/lib/auth/session");
    managed = await import("@/lib/managed/service");
    for (const k of ["owner", "other"] as const) {
      const u = await prisma.user.create({ data: { email: `dx-${k}-${t}@test.dev`, role: "COACH", passwordHash: "x" } });
      ids.push(u.id);
      if (k === "owner") owner = { id: u.id, role: "COACH" };
      else other = { id: u.id, role: "COACH" };
    }
    ficha = (await managed.createManagedAthlete(owner, { alias: `DX ${t}`, category: "Sub-18", consent: true })).userId;
  });

  afterAll(async () => {
    await prisma.planDay.deleteMany({ where: { userId: ficha } });
    await prisma.trainingSession.deleteMany({ where: { userId: ficha } });
    await prisma.calendarEvent.deleteMany({ where: { userId: ficha } });
    await prisma.planMeso.deleteMany({ where: { userId: ficha } });
    await prisma.trainingCycle.deleteMany({ where: { userId: ficha } });
    await prisma.managedAthlete.deleteMany({ where: { coachId: { in: ids } } });
    await prisma.user.deleteMany({ where: { managedById: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  });

  it("un .docx se reconoce (no es un zip de PDF), muestra vista previa y no escribe nada hasta confirmar", async () => {
    const up = await files.parsePlanUpload([{ name: "plan.docx", bytes: bytes() }]);
    expect(up.skipped).toEqual([]);
    expect(up.mesos).toHaveLength(1);
    const target = await session.resolveAthleteId(owner, ficha, "PLANNING", "write");
    const prev = await service.previewPlanImport(target, up);
    expect(prev.totalDays).toBe(2);
    expect(prev.mesos[0]).toMatchObject({ code: "M7", exercises: 2, diff: { created: 2, changed: 0 } });
    expect(await prisma.planDay.count({ where: { userId: ficha } })).toBe(0);
  });

  it("al confirmar crea el plan y las sesiones planificadas EN LA FICHA, no en la entrenadora; reimportar no duplica", async () => {
    const up = await files.parsePlanUpload([{ name: "plan.docx", bytes: bytes() }]);
    const r = await service.commitPlanImport(ficha, up);
    expect(r).toMatchObject({ days: 2, sessionsCreated: 2 });
    expect(await prisma.planDay.count({ where: { userId: ficha } })).toBe(2);
    expect(await prisma.trainingSession.count({ where: { userId: ficha, status: "PLANNED" } })).toBe(2);
    expect(await prisma.planDay.count({ where: { userId: owner.id } })).toBe(0);
    const day = await prisma.planDay.findFirstOrThrow({ where: { userId: ficha }, orderBy: { date: "asc" } });
    expect(JSON.stringify(day.content)).toMatch(/Prensa/);
    expect(JSON.stringify(await prisma.planMeso.findFirst({ where: { userId: ficha } }))).not.toMatch(/Persona Ficticia/);
    const again = await service.commitPlanImport(ficha, await files.parsePlanUpload([{ name: "plan.docx", bytes: bytes() }]));
    expect(again.sessionsCreated).toBe(0);
    expect(await prisma.planDay.count({ where: { userId: ficha } })).toBe(2);
  });

  it("otra entrenadora no puede importar en la ficha (403) y una archivada es solo lectura", async () => {
    await expect(session.resolveAthleteId(other, ficha, "PLANNING", "write")).rejects.toMatchObject({ status: 403 });
    await prisma.managedAthlete.update({ where: { userId: ficha }, data: { archivedAt: new Date() } });
    await expect(session.resolveAthleteId(owner, ficha, "PLANNING", "write")).rejects.toMatchObject({ status: 403 });
  });

  it("un Word que no es un plan se omite con motivo", async () => {
    const bad = zipSync({ "word/document.xml": strToU8(`<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${p("Hola")}</w:body></w:document>`) });
    const up = await files.parsePlanUpload([{ name: "otro.docx", bytes: bad }]);
    expect(up.mesos).toEqual([]);
    expect(up.skipped[0].reason).toMatch(/No es un plan en Word/);
  });
});
