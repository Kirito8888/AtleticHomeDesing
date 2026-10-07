import { describe, expect, it } from "vitest";

import { parsePatchBody } from "@/lib/api";
import { taskPatchSchema } from "@/lib/planning/schemas";
import { injuryUpdateSchema } from "@/lib/recovery/injuries";

const req = (body: unknown) => new Request("http://x", { method: "PATCH", body: JSON.stringify(body) });

describe("PATCH parcial", () => {
  it("no rellena con valores por defecto lo que no se envía", async () => {
    expect(await parsePatchBody(req({ status: "DONE" }), taskPatchSchema)).toEqual({ status: "DONE" });
    expect(await parsePatchBody(req({ resolvedOn: "2026-10-07" }), injuryUpdateSchema)).toEqual({ resolvedOn: "2026-10-07" });
    await expect(parsePatchBody(req({ priority: "MAX" }), taskPatchSchema)).rejects.toThrow();
  });
});
