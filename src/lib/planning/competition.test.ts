import { describe, expect, it } from "vitest";

import { hashShareToken, isShareToken, newShareToken } from "@/lib/security/share-token";

import { countdownLabel, sheetBest } from "./competition";
import { buildIcs, foldLine, icsText } from "./ics";

describe("modo competición", () => {
  it("cuenta atrás", () => {
    expect(countdownLabel("2026-10-10", "2026-10-07")).toBe("D−3");
    expect(countdownLabel("2026-10-07", "2026-10-07")).toBe("Día D");
    expect(countdownLabel("2026-10-06", "2026-10-07")).toBe("D+1");
  });

  it("mejor intento de la hoja", () => {
    expect(sheetBest([{ markM: 50, isFoul: false, windMs: null }, { markM: 55, isFoul: true, windMs: null }, { markM: null, isFoul: false, windMs: null }])).toBe(50);
    expect(sheetBest([{ markM: null, isFoul: true, windMs: null }])).toBeNull();
  });
});

describe("calendario .ics", () => {
  it("escapa, pliega y marca días completos con DTEND exclusivo", () => {
    expect(icsText("A, B; C\\D\nE")).toBe("A\\, B\; C\\\\D\\nE");
    const long = "SUMMARY:" + "á".repeat(80);
    expect(foldLine(long).split("\r\n ").every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
    const ics = buildIcs("LifeOS", [{ uid: "e1", title: "Control, Burgos", start: new Date("2026-10-10"), allDay: true, location: "Pista" }], new Date("2026-10-07T10:00:00Z"));
    expect(ics).toContain("DTSTART;VALUE=DATE:20261010\r\nDTEND;VALUE=DATE:20261011");
    expect(ics).toContain("SUMMARY:Control\\, Burgos");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("tokens: 32 bytes, solo el hash se guarda", () => {
    const { token, hash } = newShareToken();
    expect(isShareToken(token)).toBe(true);
    expect(hash).toBe(hashShareToken(token));
    expect(hash).not.toContain(token);
    expect(isShareToken("../../etc")).toBe(false);
  });
});
