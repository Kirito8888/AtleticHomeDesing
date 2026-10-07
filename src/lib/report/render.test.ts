import { describe, expect, it } from "vitest";

import { renderReport, type ReportData } from "./render";

const base: ReportData = {
  athlete: "Atleta <script>",
  from: "2026-10-05",
  to: "2026-10-11",
  expiresAt: "2026-10-14",
  weeks: [{ week: "2026-10-05", planned: 1, done: 3, skipped: 1, throws: 24 }],
  sessions: [{ date: "2026-10-06", title: "Técnica <b>", status: "COMPLETED", type: "TECHNICAL", best: "51,2 m" }],
  marks: [{ label: "Jabalina · 800 g", top: [{ markM: 51.2, date: "2026-10-06", isCompetition: true }] }],
  controls: [{ date: "2026-10-05", squeeze: 2, heel: null, jumpCm: 31.5 }],
  injuries: null,
};

describe("informe para la entrenadora", () => {
  it("escapa el texto y no lleva scripts ni recursos externos", () => {
    const html = renderReport(base);
    expect(html).toContain("Atleta &lt;script&gt;");
    expect(html).toContain("Técnica &lt;b&gt;");
    expect(html).not.toMatch(/<script|src=|href=/i);
    expect(html).toContain("51,2 m");
  });

  it("molestias solo si se marcan", () => {
    expect(renderReport(base)).not.toContain("Molestias");
    expect(renderReport({ ...base, injuries: [{ area: "Rodilla", pain: 4, since: "2026-10-01", resolved: null }] })).toContain("Rodilla");
  });
});
