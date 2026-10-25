import { describe, expect, it } from "vitest";

import { checkQuota, quotaLimit, quotaPercent, STUDY_QUOTA_BYTES } from "@/lib/study/quota";

const GB = 1024 ** 3;

describe("cuota de apuntes (5 GB)", () => {
  it("el tope son 5.368.709.120 bytes", () => {
    expect(STUDY_QUOTA_BYTES).toBe(5_368_709_120);
  });

  it("4,99 GB usados + un fichero pequeño: permitido", () => {
    const c = checkQuota(4.99 * GB, 1024 * 1024);
    expect(c.ok).toBe(true);
  });

  it("5,01 GB usados: rechazado, aunque el fichero sea mínimo", () => {
    expect(checkQuota(5.01 * GB, 1).ok).toBe(false);
  });

  it("4,99 GB + un fichero que cruza el límite: rechazado", () => {
    expect(checkQuota(4.99 * GB, 0.02 * GB).ok).toBe(false);
  });

  it("llegar justo a 5 GB vale; un byte más, no", () => {
    expect(checkQuota(STUDY_QUOTA_BYTES - 100, 100).ok).toBe(true);
    expect(checkQuota(STUDY_QUOTA_BYTES - 100, 101).ok).toBe(false);
  });

  it("informa de lo que queda", () => {
    expect(checkQuota(GB, 0).remaining).toBe(4 * GB);
    expect(checkQuota(6 * GB, 0).remaining).toBe(0);
  });

  it("el .env puede bajar el tope, nunca subirlo", () => {
    expect(quotaLimit(200)).toBe(200 * 1024 * 1024);
    expect(quotaLimit(5120)).toBe(STUDY_QUOTA_BYTES);
    expect(quotaLimit(999_999)).toBe(STUDY_QUOTA_BYTES);
    expect(quotaLimit(undefined)).toBe(STUDY_QUOTA_BYTES);
    expect(quotaLimit(0)).toBe(STUDY_QUOTA_BYTES);
  });

  it("porcentaje de la barra acotado a 0–100", () => {
    expect(quotaPercent(0, STUDY_QUOTA_BYTES)).toBe(0);
    expect(quotaPercent(STUDY_QUOTA_BYTES / 2, STUDY_QUOTA_BYTES)).toBe(50);
    expect(quotaPercent(9 * GB, STUDY_QUOTA_BYTES)).toBe(100);
  });
});
