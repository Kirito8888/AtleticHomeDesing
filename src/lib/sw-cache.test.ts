import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

import { describe, expect, it } from "vitest";

// v3.0 S · V3-S06: TTL de 24 h y purga ante 401 / redirección a /login en el service worker.
const src = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
const CUID = "cm1abcdefghijklmnopqrstuv";
const ORIGIN = "https://app.example";
const PATH = `/training/${CUID}`;

class FakeCache {
  map = new Map<string, Response>();
  async keys() { return [...this.map.keys()].map((u) => new Request(u)); }
  async match(r: Request | string) { return this.map.get(typeof r === "string" ? new URL(r, ORIGIN).href : r.url)?.clone(); }
  async put(r: Request | string, res: Response) { this.map.set(typeof r === "string" ? new URL(r, ORIGIN).href : r.url, res); }
  async delete(r: Request | string) { return this.map.delete(typeof r === "string" ? new URL(r, ORIGIN).href : r.url); }
}

function setup(fetchImpl: (r: Request) => Promise<Response>) {
  const store = new Map<string, FakeCache>();
  const open = (n: string) => store.get(n) ?? (store.set(n, new FakeCache()), store.get(n)!);
  const caches = {
    open: async (n: string) => open(n),
    keys: async () => [...store.keys()],
    has: async (n: string) => store.has(n),
    delete: async (n: string) => store.delete(n),
    match: async (r: Request | string) => { for (const c of store.values()) { const m = await c.match(r); if (m) return m; } return undefined; },
  };
  const listeners: Record<string, (e: unknown) => void> = {};
  const self = { location: { origin: ORIGIN }, addEventListener: (t: string, f: (e: unknown) => void) => (listeners[t] = f), skipWaiting() {}, clients: { claim: async () => {} } };
  const ctx = vm.createContext({ self, caches, fetch: fetchImpl, Response, Request, Headers, URL, Date, Promise, console });
  vm.runInContext(src, ctx);
  const pending: Promise<unknown>[] = [];
  const nav = async (path: string) => {
    let out: Promise<Response> | undefined;
    listeners.fetch({ request: { method: "GET", url: ORIGIN + path, mode: "navigate" }, respondWith: (p: Promise<Response>) => (out = p), waitUntil: (p: Promise<unknown>) => pending.push(p) });
    const res = await out!;
    await Promise.all(pending);
    return res;
  };
  return { store, open, listeners, nav, pending, ctx };
}

const stamped = (ageMs: number) => new Response("privado", { headers: { "x-atlenza-cached-at": String(Date.now() - ageMs) } });

describe("sw.js · TTL y purga de copias privadas", () => {
  it("el TTL es de 24 h", () => expect(vm.runInNewContext(`${/const PRIVATE_TTL_MS = [^;]+;/.exec(src)![0]}\nPRIVATE_TTL_MS`)).toBe(24 * 3600 * 1000));

  it("la navegación guarda la copia con sello", async () => {
    const t = setup(async () => new Response("hola", { status: 200 }));
    await t.nav(PATH);
    const res = await t.open("lifeos-v4-pages").match(ORIGIN + PATH);
    expect(Number(res!.headers.get("x-atlenza-cached-at"))).toBeGreaterThan(0);
  });

  it("sin red: copia fresca se sirve; con 25 h, sin sello o futura → /offline y se borra", async () => {
    const t = setup(async () => { throw new Error("offline"); });
    const pages = t.open("lifeos-v4-pages");
    await pages.put(ORIGIN + "/offline", new Response("offline"));
    await pages.put(ORIGIN + PATH, stamped(60_000));
    expect(await (await t.nav(PATH)).text()).toBe("privado");
    for (const bad of [stamped(25 * 3600 * 1000), new Response("viejo"), stamped(-3600_000)]) {
      await pages.put(ORIGIN + PATH, bad);
      expect(await (await t.nav(PATH)).text()).toBe("offline");
      expect(pages.map.has(ORIGIN + PATH)).toBe(false);
    }
  });

  it("401 o redirección a /login purgan páginas y ficheros compartidos, conservando /offline", async () => {
    for (const mk of [() => new Response("no", { status: 401 }), () => Object.defineProperties(new Response("login"), { redirected: { value: true }, url: { value: ORIGIN + "/login?callbackUrl=x" } })]) {
      const t = setup(async () => mk());
      const pages = t.open("lifeos-v4-pages");
      await pages.put(ORIGIN + "/offline", new Response("offline"));
      await pages.put(ORIGIN + PATH, stamped(1000));
      await t.open("lifeos-share").put(ORIGIN + "/__shared/0", stamped(1000));
      await t.nav("/training");
      expect([...pages.map.keys()]).toEqual([ORIGIN + "/offline"]);
      expect(t.store.has("lifeos-share")).toBe(false);
    }
  });

  it("activate barra lo caducado y el mensaje «purge» lo borra todo", async () => {
    const t = setup(async () => new Response("x"));
    const pages = t.open("lifeos-v4-pages");
    await pages.put(ORIGIN + "/offline", new Response("offline"));
    await pages.put(ORIGIN + PATH, stamped(25 * 3600 * 1000));
    await pages.put(ORIGIN + `/planning/plan/${CUID}`, stamped(1000));
    t.open("lifeos-share").put(ORIGIN + "/__shared/0", stamped(25 * 3600 * 1000));
    let done: Promise<unknown> | undefined;
    t.listeners.activate({ waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
    expect([...pages.map.keys()].sort()).toEqual([ORIGIN + "/offline", ORIGIN + `/planning/plan/${CUID}`].sort());
    expect(t.store.has("lifeos-share")).toBe(false);
    let p2: Promise<unknown> | undefined;
    t.listeners.message({ data: { type: "purge" }, waitUntil: (p: Promise<unknown>) => (p2 = p) });
    await p2;
    expect([...pages.map.keys()]).toEqual([ORIGIN + "/offline"]);
  });
});
