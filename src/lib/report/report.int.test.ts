// Integración con BD real: informe para la entrenadora (token, caducidad, qué incluye y qué no).
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("informe para la entrenadora (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("./service");
  let userId: string;
  const d = (s: string) => new Date(`${s}T00:00:00Z`);

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    svc = await import("./service");
    userId = (await prisma.user.create({ data: { email: `rep-${Date.now()}@test.dev`, name: "Prueba Apellido" } })).id;
    await prisma.trainingSession.create({ data: { userId, date: d("2026-10-06"), type: "STRENGTH", status: "COMPLETED", title: "Fuerza A (versión suave)", notes: "NOTA-PRIVADA" } });
    await prisma.trainingSession.create({
      data: {
        userId,
        date: d("2026-10-07"),
        type: "TECHNICAL",
        status: "COMPLETED",
        title: "Técnica",
        technical: { create: { event: "JAVELIN", implementWeightG: 800, bestMarkM: 47.3, attempts: { create: [{ order: 0, markM: 47.3 }, { order: 1, markM: 45 }] } } },
      },
    });
    await prisma.trainingSession.create({ data: { userId, date: d("2026-10-09"), type: "TRACK", status: "PLANNED", title: "Pista" } });
    await prisma.recoveryMetrics.create({ data: { userId, date: d("2026-10-05"), squeezePain: 2, jumpCm: 31.5, bodyWeightKg: 77.7, hrvRmssdMs: 88.8, notes: "SALUD-PRIVADA" } });
    await prisma.injury.create({ data: { userId, area: "KNEE", pain: 4, startedOn: d("2026-10-01") } });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
  });

  it("planificado frente a hecho, lanzamientos, marcas y controles; sin peso, VFC, notas ni «versión suave»", async () => {
    const { token } = await svc.createReport(userId, { from: "2026-10-05", to: "2026-10-11", includeInjuries: false });
    const html = (await svc.reportHtml(token))!;
    expect(html).toContain("Informe de Prueba");
    expect(html).not.toContain("Apellido");
    expect(html).toContain("<td>2026-10-05</td><td>3</td><td>2</td><td>0</td><td>2</td>");
    expect(html).toContain("Jabalina · 800 g");
    expect(html).toContain("47,3 m");
    expect(html).toContain("31,5");
    expect(html).not.toMatch(/77[.,]7|88[.,]8|NOTA-PRIVADA|SALUD-PRIVADA|versión suave|Rodilla|Molestias/);
  });

  it("molestias solo si se marcan; caduca y se revoca", async () => {
    const { token } = await svc.createReport(userId, { from: "2026-10-05", to: "2026-10-11", includeInjuries: true });
    expect(await svc.reportHtml(token)).toContain("Rodilla");
    expect(await svc.reportHtml(token, new Date(Date.now() + 8 * 864e5))).toBeNull();
    const [r] = await svc.listReports(userId);
    await svc.revokeReport(userId, r.id);
    expect(await svc.reportHtml(token)).toBeNull();
    expect(await svc.reportHtml("x".repeat(43))).toBeNull();
  });
});
