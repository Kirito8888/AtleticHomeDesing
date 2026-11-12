// Integración (v1.9): vigilancia interna con BD real y un Telegram simulado.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("vigilancia interna (BD real)", () => {
  let watch: typeof import("./watch");
  let metrics: typeof import("./metrics");
  let telegram: typeof import("./telegram");
  let prisma: typeof import("@/lib/prisma").prisma;
  const created: string[] = [];

  beforeAll(async () => {
    process.env.TELEGRAM_BOT_TOKEN = "123456:TEST-token-abcdefghijklmnopqrstuvw";
    process.env.TELEGRAM_ADMIN_CHAT_ID = "4242";
    vi.resetModules();
    watch = await import("./watch");
    metrics = await import("./metrics");
    telegram = await import("./telegram");
    prisma = (await import("@/lib/prisma")).prisma;
  });
  afterAll(async () => {
    await prisma.backupRun.deleteMany({ where: { id: { in: created } } });
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_ADMIN_CHAT_ID;
  });

  it("avisa una vez de un problema nuevo, lo recuerda a las 6 h y dice cuándo se resuelve", async () => {
    await watch.resetWatch();
    await prisma.apiMetricMinute.deleteMany();
    metrics.resetMetrics();
    const now = new Date();
    const sent: string[] = [];
    const send = async (t: string) => (sent.push(t), true);
    // Pico de errores 500
    for (let i = 0; i < 12; i++) metrics.recordRequest("GET", "/api/x", 500, 3, now.getTime());
    const first = await watch.runWatchJob(now, send);
    expect(first.some((t) => /12 errores 500/.test(t))).toBe(true);
    expect((await watch.runWatchJob(new Date(now.getTime() + 5 * 60_000), send)).filter((t) => /errores/.test(t))).toEqual([]);
    expect((await watch.runWatchJob(new Date(now.getTime() + 6 * 3600_000 - 60_000), send)).some((t) => /resuelto \(errors\)/.test(t))).toBe(true);
  });

  it("varias réplicas: los 500 se suman y el aviso no se repite aunque otra réplica lance la vigilancia", async () => {
    await watch.resetWatch();
    await prisma.apiMetricMinute.deleteMany();
    const now = new Date();
    const sent: string[] = [];
    const send = async (t: string) => (sent.push(t), true);
    // Cada réplica ve solo 6 errores (por debajo del umbral de 10); juntas, 12
    for (const id of ["replica-a", "replica-b"]) {
      metrics.asReplica(id);
      for (let i = 0; i < 6; i++) metrics.recordRequest("GET", "/api/x", 500, 3, now.getTime());
      await metrics.flushMetrics(now.getTime());
    }
    expect((await metrics.metricsSummary(now.getTime())).errors).toBe(12);
    // «Réplica c» (memoria vacía) lanza la vigilancia: avisa; «réplica d» (otra memoria) no repite
    metrics.asReplica("replica-c");
    expect((await watch.runWatchJob(now, send)).some((t) => /12 errores 500/.test(t))).toBe(true);
    metrics.asReplica("replica-d");
    expect(await watch.runWatchJob(new Date(now.getTime() + 5 * 60_000), send)).toEqual([]);
    expect(sent).toHaveLength(1);
    await prisma.apiMetricMinute.deleteMany();
    await watch.resetWatch();
  });

  it("una copia de seguridad fallida es un problema", async () => {
    await watch.resetWatch();
    const r = await prisma.backupRun.create({ data: { ok: false, detail: "disco lleno" } });
    created.push(r.id);
    const problems = await watch.checkHealth();
    expect(problems.find((p) => p.key === "backup")?.text).toMatch(/falló \(disco lleno\)/);
  });

  it("Telegram: manda chat y texto al bot configurado y nunca escribe el token en los logs", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const ok = await telegram.sendAdminTelegram("hola", async (url, init) => {
      calls.push({ url: String(url), body: String(init?.body) });
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
    });
    expect(ok).toBe(true);
    expect(calls[0].url).toBe("https://api.telegram.org/bot123456:TEST-token-abcdefghijklmnopqrstuvw/sendMessage");
    expect(JSON.parse(calls[0].body)).toMatchObject({ chat_id: "4242", text: "hola" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await telegram.sendAdminTelegram("x", async () => Promise.reject(new Error("fallo en https://api.telegram.org/bot123456:TEST-token-abcdefghijklmnopqrstuvw/x")))).toBe(false);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("TEST-token");
    warn.mockRestore();
  });
});

// v2.11 B4-A · O21: flushMetrics sube solo lo modificado, en una sentencia, y reintenta si falla.
// Va en este fichero (no aparte) porque comparte tabla con la vigilancia, que la vacía: así corren en serie.
describe.skipIf(!HAS_DB)("flushMetrics incremental (BD real)", () => {
  let metrics: typeof import("./metrics");
  let prisma: typeof import("@/lib/prisma").prisma;
  const now = Date.UTC(2031, 5, 1, 12, 30, 20); // lejos de la ventana real: no mezcla con la vigilancia
  const settle = () => new Promise((r) => setTimeout(r, 300));
  const rows = (replica: string) => prisma.apiMetricMinute.findMany({ where: { replica }, orderBy: [{ minute: "asc" }, { route: "asc" }] });

  beforeAll(async () => {
    vi.resetModules();
    metrics = await import("./metrics");
    prisma = (await import("@/lib/prisma")).prisma;
  });
  beforeEach(async () => {
    metrics.asReplica("replica-o21");
    await prisma.apiMetricMinute.deleteMany({ where: { replica: "replica-o21" } });
  });
  afterAll(async () => {
    await prisma.apiMetricMinute.deleteMany({ where: { replica: "replica-o21" } });
  });

  it("sube todo la primera vez, nada si no hay cambios y solo el minuto modificado después", async () => {
    for (let m = 2; m >= 0; m--) for (const r of ["a", "b"]) metrics.recordRequest("GET", `/api/${r}`, m === 0 && r === "a" ? 500 : 200, 10 + m, now - m * 60_000);
    await metrics.flushMetrics(now);
    await settle(); // recordRequest sube en segundo plano al cambiar de minuto
    const first = await rows("replica-o21");
    expect(first).toHaveLength(6);
    expect(first.find((x) => x.route === "GET /api/a" && x.minute.getTime() === Math.floor(now / 60_000) * 60_000)).toMatchObject({ count: 1, errors: 1, ms: [10] });

    // Se borra a mano lo subido: un segundo flush sin cambios NO lo vuelve a escribir
    await prisma.apiMetricMinute.deleteMany({ where: { replica: "replica-o21" } });
    await metrics.flushMetrics(now);
    expect(await rows("replica-o21")).toHaveLength(0);

    // Cambia una sola ruta/minuto: solo esa fila reaparece, con el total acumulado
    metrics.recordRequest("GET", "/api/b", 200, 99, now);
    await metrics.flushMetrics(now);
    await settle(); // al cambiar de minuto recordRequest ya sube en segundo plano
    const after = await rows("replica-o21");
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ route: "GET /api/b", count: 2, errors: 0, ms: [10, 99] });
  });

  it("si la BD falla, lo pendiente se reintenta en el siguiente flush", async () => {
    vi.resetModules();
    const real = (await import("@/lib/prisma")).prisma;
    let fail = true;
    vi.doMock("@/lib/prisma", () => ({
      prisma: { $executeRaw: (...a: Parameters<typeof real.$executeRaw>) => (fail ? ((fail = false), Promise.reject(new Error("BD caída"))) : real.$executeRaw(...a)) },
    }));
    const m = await import("./metrics");
    m.asReplica("replica-o21");
    m.recordRequest("GET", "/api/c", 200, 7, now);
    await expect(m.flushMetrics(now)).rejects.toThrow("BD caída");
    expect(await rows("replica-o21")).toHaveLength(0);
    await m.flushMetrics(now);
    expect(await rows("replica-o21")).toMatchObject([{ route: "GET /api/c", count: 1 }]);
    vi.doUnmock("@/lib/prisma");
  });

  it("lo que llega mientras se escribe no se pierde, y el minuto se guarda en UTC", async () => {
    metrics.recordRequest("GET", "/api/d", 200, 5, now);
    const flushing = metrics.flushMetrics(now);
    metrics.recordRequest("GET", "/api/d", 200, 6, now); // durante el await
    await flushing;
    await metrics.flushMetrics(now);
    const [row] = await rows("replica-o21");
    expect(row.minute.toISOString()).toBe("2031-06-01T12:30:00.000Z");
    expect(row.count).toBe(2);
  });
});
