import { describe, expect, it } from "vitest";

import { shareTargetsFor } from "@/lib/share";

describe("shareTargetsFor", () => {
  it("elige el destino por extensión o tipo", () => {
    expect(shareTargetsFor("federacion.ics", "")).toEqual(["competitions"]);
    expect(shareTargetsFor("plan.zip", "application/zip")).toEqual(["plan"]);
    expect(shareTargetsFor("dia1.PDF", "")[0]).toBe("plan");
    expect(shareTargetsFor("ticket.jpg", "image/jpeg")).toEqual(["injury", "receipt"]);
    expect(shareTargetsFor("extracto.csv", "text/csv")).toEqual(["bank", "competitions"]);
    expect(shareTargetsFor("banco.n43", "")).toEqual(["bank"]);
    expect(shareTargetsFor("tema3.md", "")[0]).toBe("document");
  });
  it("sin destino para tipos desconocidos", () => {
    expect(shareTargetsFor("video.mp4", "video/mp4")).toEqual([]);
  });
});
