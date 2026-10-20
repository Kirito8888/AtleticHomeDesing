import { describe, expect, it } from "vitest";

import { buildNav } from "@/components/layout/nav-items";

import { backupState } from "./ops";
import { routePattern, scrubMessage } from "./server-errors";

describe("operación v1.8", () => {
  it("ruta sin identificadores y mensaje sin datos personales", () => {
    expect(routePattern("/api/training/sessions/clx9a8b7c6d5e4f3g2h1i0j9k?x=1")).toBe("/api/training/sessions/[id]");
    expect(routePattern("/training/routine/123")).toBe("/training/routine/[id]");
    expect(routePattern("/planning/competition/9f1c2d3e-4b5a-6789-8abc-def012345678")).toBe("/planning/competition/[id]");
    expect(scrubMessage("Error: no existe ana.garcia@correo.es con token abcdefghijklmnopqrstuvwxyz0123456789")).toBe("Error: no existe [email] con token [token]");
  });

  it("ocultar módulos: la barra inferior se rellena con los que quedan", () => {
    const n = buildNav({ hidden: ["nutrition", "study"] });
    expect(n.groups.flatMap((g) => g.items).map((i) => i.href)).not.toContain("/nutrition");
    expect(n.bar.map((i) => i.href)).toEqual(["/", "/training", "/planning", "/recovery"]);
    expect(buildNav({ hidden: ["planning", "recovery"] }).bar.map((i) => i.href)).toEqual(["/", "/training", "/nutrition", "/goals"]);
  });
});

describe("aviso de copias (Bloque 8)", () => {
  const now = new Date("2030-01-10T12:00:00Z");
  const run = (ok: boolean, hoursAgo: number, detail?: string) => ({ ok, at: new Date(now.getTime() - hoursAgo * 3600_000), detail });

  it("sin ninguna copia: el servicio no está activo", () => {
    const st = backupState(null, null, now);
    expect(st).toMatchObject({ ok: false, none: true });
    expect(st.message).toMatch(/no está activo/);
  });

  it("la última falló → aviso con el detalle", () => {
    const st = backupState(run(false, 1, "disco lleno"), run(true, 30), now);
    expect(st.ok).toBe(false);
    expect(st.message).toContain("disco lleno");
  });

  it("copia buena de hace más de 36 h → aviso; de 35 h o menos → sin aviso", () => {
    expect(backupState(run(true, 37), run(true, 37), now).message).toMatch(/36 horas/);
    expect(backupState(run(true, 35), run(true, 35), now)).toEqual({ ok: true, none: false, message: null });
    expect(backupState(run(true, 1), run(true, 1), now).ok).toBe(true);
  });

  it("registros de fallo recientes sin ninguna buena → aviso", () => {
    expect(backupState(run(true, 1), null, now).ok).toBe(false);
  });
});

describe("mensajes de error sin valores (Bloque 8)", () => {
  it("quita lo que va entre comillas o llaves (valores de Prisma) y las IP", () => {
    const m = scrubMessage('PrismaClientKnownRequestError: Invalid invocation { data: { nota: "dolor de rodilla" } } desde 10.0.0.5');
    expect(m).not.toMatch(/dolor|rodilla|10\.0\.0\.5/);
  });
});
