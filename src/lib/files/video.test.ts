import { describe, expect, it } from "vitest";

import { checkVideo, sniffVideo, VIDEO_MAX_BYTES } from "./video";

const mp4 = (brand = "isom") => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftyp" + brand), Buffer.alloc(32)]);
const ebml = (doc: string) => Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84]), Buffer.from(doc), Buffer.alloc(32)]);

describe("vídeo propio (v2.1)", () => {
  it("MP4 y WebM por firma", () => {
    expect(sniffVideo(mp4())).toBe("video/mp4");
    expect(sniffVideo(mp4("mp42"))).toBe("video/mp4");
    expect(sniffVideo(ebml("webm"))).toBe("video/webm");
  });
  it("rechaza QuickTime, MKV, imágenes y basura", () => {
    expect(sniffVideo(mp4("qt  "))).toBeNull();
    expect(sniffVideo(ebml("matroska"))).toBeNull();
    expect(sniffVideo(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull();
    expect(sniffVideo(Buffer.from("hola"))).toBeNull();
  });
  it("checkVideo: tipo, vacío y tamaño (25 MB exactos valen, uno más no)", () => {
    expect(checkVideo(mp4())).toEqual({ ok: true, mime: "video/mp4" });
    expect(checkVideo(Buffer.alloc(0))).toMatchObject({ ok: false, status: 415 });
    expect(checkVideo(mp4("qt  "))).toMatchObject({ ok: false, status: 415, message: expect.stringContaining("MP4") });
    const big = Buffer.alloc(VIDEO_MAX_BYTES + 1);
    mp4().copy(big);
    expect(checkVideo(big)).toMatchObject({ ok: false, status: 413 });
    expect(checkVideo(big.subarray(0, VIDEO_MAX_BYTES))).toMatchObject({ ok: true });
  });
});
