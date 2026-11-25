// v3.2 N (V3-L02 p5): todas las exportaciones llevan el pie de autoría, idéntico y sin datos de la instalación.
import { describe, expect, it } from "vitest";

import { shapeExport } from "@/lib/account/export-modules";
import { AUTHORSHIP_NOTICE } from "@/lib/legal/notice";
import { buildIcs } from "@/lib/planning/ics";
import { renderReport } from "@/lib/report/render";
import { renderManualHtml } from "@/lib/study/practical-manual";

/** El .ics pliega las líneas a 75 octetos: se deshace antes de comparar. */
const unfold = (s: string) => s.replace(/\r\n[ \t]/g, "");
const INSTALLATION = /https?:\/\/|localhost|127\.0\.0\.1|\b\d{1,3}(\.\d{1,3}){3}\b/;

describe("pie de autoría en las exportaciones", () => {
  it(".ics", () => {
    const ics = unfold(buildIcs("Plan", [{ uid: "1", title: "Sesión", start: new Date("2026-10-01T08:00:00Z"), end: null, allDay: false } as never]));
    expect(ics).toContain(`X-WR-CALDESC:${AUTHORSHIP_NOTICE}`);
    expect(ics).not.toMatch(INSTALLATION);
  });
  it("informe semanal compartido", () => {
    const html = renderReport({ athlete: "A", from: "2026-10-05", to: "2026-10-11", expiresAt: "2026-10-14", weeks: [], sessions: [], marks: [], controls: [], injuries: null });
    expect(html).toContain(AUTHORSHIP_NOTICE);
    expect(html).not.toMatch(INSTALLATION);
  });
  it("exportación JSON", () => {
    expect(shapeExport({ user: {} }, { modules: [], sensitive: false }).notice).toBe(AUTHORSHIP_NOTICE);
  });
  it("manual PDF (HTML de origen sin pie propio: lo pone el pie de página de Chromium)", () => {
    // El pie va en `pdf-render.ts` (footerTemplate); aquí solo se asegura que el HTML no cuele datos de la instalación
    expect(renderManualHtml({ title: "M", sections: [] } as never)).not.toMatch(INSTALLATION);
  });
});
