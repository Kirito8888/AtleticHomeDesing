import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const lookupMock = vi.fn();
vi.mock("node:dns/promises", () => ({ lookup: (...a: unknown[]) => lookupMock(...a) }));

import { ipv6Bytes, isPrivateAddress, pinnedFetch, pinnedLookup, resolvePublic } from "./ssrf";

beforeEach(() => lookupMock.mockReset());

describe("V3-S04 · rangos", () => {
  it("bloquea NAT64, 6to4, Teredo, IPv4 mapeada en cualquier forma y reservadas", () => {
    for (const ip of [
      "64:ff9b::7f00:1", "64:ff9b::808:808", "64:ff9b:1::1", "2002:7f00:1::", "2002:808:808::", "2001:0:4136:e378:8000:63bf:3fff:fdd2",
      "::ffff:7f00:1", "0:0:0:0:0:ffff:7f00:1", "::ffff:a9fe:a9fe", "::ffff:127.0.0.1", "::127.0.0.1", "fe80::1%eth0", "fec0::1", "2001:db8::1", "100::1",
      "192.0.2.1", "198.51.100.7", "203.0.113.9", "192.0.0.8", "::", "::1", "fc00::1", "ff02::1", "no-es-ip",
    ]) expect(isPrivateAddress(ip), ip).toBe(true);
  });
  it("deja pasar direcciones públicas", () => {
    for (const ip of ["8.8.8.8", "2606:4700::1111", "::ffff:808:808", "::ffff:8.8.8.8", "104.18.1.1"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });
  it("parsea IPv6 a 16 bytes", () => {
    expect(ipv6Bytes("::ffff:7f00:1")).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 127, 0, 0, 1]);
    expect(ipv6Bytes("::ffff:1.2.3.4")?.slice(12)).toEqual([1, 2, 3, 4]);
    expect(ipv6Bytes("x")).toBeNull();
  });
});

describe("V3-S04 · DNS rebinding", () => {
  it("resuelve una sola vez y la conexión sigue yendo a la IP comprobada", async () => {
    lookupMock.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }]).mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    const addrs = await resolvePublic("rebind.example");
    expect(addrs).toEqual([{ address: "93.184.216.34", family: 4 }]);
    const lk = pinnedLookup(addrs as never);
    const one = await new Promise((r) => lk("rebind.example", {}, (_e, a) => r(a)));
    const all = await new Promise((r) => lk("rebind.example", { all: true }, (_e, a) => r(a)));
    expect(one).toBe("93.184.216.34");
    expect(all).toEqual([{ address: "93.184.216.34", family: 4 }]);
    expect(lookupMock).toHaveBeenCalledTimes(1);
  });
  it("rechaza si alguna respuesta es interna, o si no resuelve", async () => {
    lookupMock.mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }, { address: "64:ff9b::7f00:1", family: 6 }]);
    expect(await resolvePublic("x.example")).toBe("private");
    lookupMock.mockRejectedValueOnce(new Error("nx"));
    expect(await resolvePublic("y.example")).toBeNull();
  });
  it("pinnedFetch pasa el lookup fijado a https.request y no sigue redirecciones", async () => {
    let seen: { lookup?: unknown; method?: string } = {};
    const { EventEmitter } = await import("node:events");
    const request = vi.fn((_url: unknown, o: typeof seen, cb: (r: unknown) => void) => {
      seen = o;
      const req = Object.assign(new EventEmitter(), { write: vi.fn(), end: () => {
        const res = Object.assign(new EventEmitter(), { statusCode: 302, headers: { location: "http://127.0.0.1/" }, destroy: vi.fn() });
        cb(res);
        res.emit("end");
      } });
      return req;
    });
    const f = pinnedFetch([{ address: "93.184.216.34", family: 4 }], { request: request as never });
    const res = await f("https://api.example/v1/chat", { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
    expect(res.status).toBe(302);
    expect(typeof seen.lookup).toBe("function");
    await expect(pinnedFetch([{ address: "1.1.1.1", family: 4 }])("http://x.example/")).rejects.toThrow();
    expect(lookupMock).not.toHaveBeenCalled();
  });
});
