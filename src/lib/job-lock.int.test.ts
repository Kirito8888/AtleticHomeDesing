// Integración (v2.0 E): cerrojo por tarea entre réplicas con pg_try_advisory_lock y BD real.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const gate = () => {
  let open!: () => void;
  const p = new Promise<void>((r) => (open = r));
  return { p, open };
};

describe.skipIf(!HAS_DB)("withJobLock (BD real)", () => {
  it("dos réplicas a la vez: solo una ejecuta; al terminar se puede volver a adquirir", async () => {
    const { withJobLock } = await import("./job-lock");
    const name = `t-mutex-${Date.now()}`;
    const g = gate();
    let runs = 0;
    const first = withJobLock(name, async () => {
      runs++;
      await g.p;
      return "a";
    });
    await vi.waitFor(() => expect(runs).toBe(1));
    const second = await withJobLock(name, async () => {
      runs++;
      return "b";
    });
    expect(second).toEqual({ ran: false });
    g.open();
    expect(await first).toEqual({ ran: true, value: "a" });
    expect(runs).toBe(1);
    expect(await withJobLock(name, async () => "c")).toEqual({ ran: true, value: "c" });
  });

  it("tareas con nombre distinto no se bloquean entre sí", async () => {
    const { withJobLock } = await import("./job-lock");
    const t = Date.now();
    const g = gate();
    const a = withJobLock(`t-a-${t}`, () => g.p);
    await new Promise((r) => setTimeout(r, 50));
    expect(await withJobLock(`t-b-${t}`, async () => 1)).toEqual({ ran: true, value: 1 });
    g.open();
    await a;
  });

  it("si la tarea falla, el error sube y el cerrojo queda libre (finally)", async () => {
    const { withJobLock } = await import("./job-lock");
    const { prisma } = await import("@/lib/prisma");
    const name = `t-fail-${Date.now()}`;
    await expect(withJobLock(name, async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    const held = await prisma.$queryRaw<Array<{ n: number }>>`select count(*)::int as n from pg_locks where locktype = 'advisory' and classid = 20020 and objid = hashtext(${name})::oid`;
    expect(held[0].n).toBe(0);
    expect(await withJobLock(name, async () => "ok")).toEqual({ ran: true, value: "ok" });
  });
});
