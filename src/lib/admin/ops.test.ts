import { describe, expect, it } from "vitest";

import { visibleNav } from "@/components/layout/nav-items";

import { routePattern, scrubMessage } from "./server-errors";

describe("operación v1.8", () => {
  it("ruta sin identificadores y mensaje sin datos personales", () => {
    expect(routePattern("/api/training/sessions/clx9a8b7c6d5e4f3g2h1i0j9k?x=1")).toBe("/api/training/sessions/[id]");
    expect(routePattern("/training/routine/123")).toBe("/training/routine/[id]");
    expect(routePattern("/planning/competition/9f1c2d3e-4b5a-6789-8abc-def012345678")).toBe("/planning/competition/[id]");
    expect(scrubMessage("Error: no existe ana.garcia@correo.es con token abcdefghijklmnopqrstuvwxyz0123456789")).toBe("Error: no existe [email] con token [token]");
  });

  it("ocultar módulos: la barra inferior se rellena con los que quedan", () => {
    const n = visibleNav(["nutrition", "study"]);
    expect(n.all.map((i) => i.href)).toEqual(["/", "/training", "/recovery", "/planning", "/finance", "/settings"]);
    expect(n.mobile.map((i) => i.href)).toEqual(["/", "/training", "/planning", "/recovery", "/finance"]);
    expect(visibleNav([]).mobile).toHaveLength(5);
  });
});
