import "server-only";

import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";

/**
 * v3.0 S · V3-S04 · Guarda SSRF para URL escritas por usuarias (proveedores compatibles con OpenAI).
 *  - Rangos privados, reservados y de traducción (NAT64, 6to4, Teredo, IPv4 mapeada en cualquier forma).
 *  - El nombre se resuelve **una sola vez**: la conexión va a esas IP con un `lookup` propio que no
 *    vuelve a consultar el DNS (sin ventana para DNS rebinding entre comprobar y conectar).
 */

export type PinnedAddress = { address: string; family: 4 | 6 };

function v4Private(ip: string): boolean {
  const [a, b, c] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

/** IPv6 → 16 bytes (expande «::», admite IPv4 punteada al final y quita la zona «%eth0»). null si no es válida. */
export function ipv6Bytes(raw: string): number[] | null {
  const ip = raw.split("%")[0].toLowerCase();
  if (isIP(ip) !== 6) return null;
  let tail: number[] = [];
  let head = ip;
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (dotted) {
    tail = dotted[1].split(".").map(Number);
    head = ip.slice(0, -dotted[1].length);
    if (head.endsWith(":") && !head.endsWith("::")) head = head.slice(0, -1);
  }
  const groupsNeeded = 8 - tail.length / 2;
  const parse = (s: string) => (s ? s.split(":").filter((g) => g !== "") : []);
  let groups: string[];
  if (head.includes("::")) {
    const [l, r] = head.split("::");
    const left = parse(l);
    const right = parse(r);
    groups = [...left, ...Array(groupsNeeded - left.length - right.length).fill("0"), ...right];
  } else groups = parse(head);
  if (groups.length !== groupsNeeded) return null;
  const bytes: number[] = [];
  for (const g of groups) {
    const n = parseInt(g, 16);
    bytes.push(n >> 8, n & 0xff);
  }
  return [...bytes, ...tail];
}

const startsWith = (b: number[], prefix: number[]) => prefix.every((x, i) => b[i] === x);

/** IPv4/IPv6 privada, local, de enlace, reservada o de traducción: no se permiten en URL escritas por usuarias. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip.split("%")[0]);
  if (v === 4) return v4Private(ip);
  if (v !== 6) return true;
  const b = ipv6Bytes(ip);
  if (!b) return true;
  const zeros = (n: number) => b.slice(0, n).every((x) => x === 0);
  const v4 = () => b.slice(12).join(".");
  if (zeros(16)) return true; // ::
  if (zeros(15) && b[15] === 1) return true; // ::1
  if (zeros(10) && b[10] === 0xff && b[11] === 0xff) return v4Private(v4()); // IPv4 mapeada (::ffff:a.b.c.d o hex)
  if (zeros(12)) return true; // IPv4-compatible (obsoleta)
  if (startsWith(b, [0, 0x64, 0xff, 0x9b])) return true; // NAT64 64:ff9b::/96 y 64:ff9b:1::/48
  if (startsWith(b, [0x20, 0x02])) return true; // 6to4 2002::/16
  if (startsWith(b, [0x20, 0x01, 0, 0])) return true; // Teredo 2001::/32
  if (startsWith(b, [0x20, 0x01, 0x0d, 0xb8])) return true; // documentación 2001:db8::/32
  if (startsWith(b, [0x01, 0, 0, 0, 0, 0, 0, 0])) return true; // descarte 100::/64
  if ((b[0] & 0xfe) === 0xfc) return true; // fc00::/7 (ULA)
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true; // fe80::/10
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0xc0) return true; // fec0::/10
  if (b[0] === 0xff) return true; // multicast
  return false;
}

/** Resuelve el nombre una sola vez; null si no resuelve, «private» si alguna IP es interna. */
export async function resolvePublic(host: string): Promise<PinnedAddress[] | null | "private"> {
  const addrs = await dnsLookup(host, { all: true }).catch(() => []);
  if (!addrs.length) return null;
  if (addrs.some((a) => isPrivateAddress(a.address))) return "private";
  return addrs.map((a) => ({ address: a.address, family: a.family === 6 ? 6 : 4 }));
}

/** `lookup` para net/tls que nunca consulta el DNS: devuelve las IP ya comprobadas. */
export function pinnedLookup(addrs: PinnedAddress[]): LookupFunction {
  if (!addrs.length) throw new Error("pinnedLookup sin direcciones");
  return ((_host: string, opts: unknown, cb?: unknown) => {
    const callback = (typeof opts === "function" ? opts : cb) as (...a: unknown[]) => void;
    const o = (typeof opts === "object" && opts ? opts : {}) as { all?: boolean; family?: number | string };
    const fam = o.family === 4 || o.family === "IPv4" ? 4 : o.family === 6 || o.family === "IPv6" ? 6 : 0;
    const list = fam ? addrs.filter((a) => a.family === fam) : addrs;
    if (!list.length) {
      const err = Object.assign(new Error("sin dirección para esa familia"), { code: "ENOTFOUND" });
      return process.nextTick(callback, err);
    }
    if (o.all) return process.nextTick(callback, null, list.map((a) => ({ address: a.address, family: a.family })));
    process.nextTick(callback, null, list[0].address, list[0].family);
  }) as LookupFunction;
}

/** Tope de la respuesta de un proveedor (chat o embeddings). */
export const PINNED_MAX_BYTES = 20 * 1024 * 1024;

/**
 * `fetch` mínimo que conecta solo a las IP fijadas (https, sin redirecciones, con tope de tamaño).
 * El certificado y el SNI se validan contra el nombre de la URL.
 */
export function pinnedFetch(addrs: PinnedAddress[], opts: { request?: typeof httpsRequest } = {}): typeof fetch {
  const lookup = pinnedLookup(addrs);
  const doRequest = opts.request ?? httpsRequest;
  return ((input: string | URL | Request, init: RequestInit = {}) =>
    new Promise<Response>((resolve, reject) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      if (url.protocol !== "https:") return reject(new TypeError("pinnedFetch solo admite https"));
      const signal = init.signal ?? undefined;
      if (signal?.aborted) return reject(Object.assign(new Error("abortado"), { name: "AbortError" }));
      const headers: Record<string, string> = {};
      new Headers(init.headers).forEach((v, k) => (headers[k] = v));
      const body = init.body == null ? null : typeof init.body === "string" ? init.body : null;
      if (init.body != null && body === null) return reject(new TypeError("pinnedFetch solo envía cuerpos de texto"));
      if (body !== null) headers["content-length"] = String(Buffer.byteLength(body));
      const req = doRequest(url, { method: init.method ?? "GET", headers, lookup, signal }, (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > PINNED_MAX_BYTES) {
            res.destroy();
            reject(new Error("respuesta demasiado grande"));
            return;
          }
          chunks.push(c);
        });
        res.on("error", reject);
        res.on("end", () => {
          const status = res.statusCode ?? 502;
          const h = new Headers();
          for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) h.set(k, Array.isArray(v) ? v.join(", ") : v);
          const nullBody = status === 204 || status === 205 || status === 304;
          // Las redirecciones no se siguen (como redirect: "error"): llegan como respuesta no ok.
          resolve(new Response(nullBody ? null : Buffer.concat(chunks), { status: status < 200 || status > 599 ? 502 : status, headers: h }));
        });
      });
      req.on("error", (e: Error) => reject(signal?.aborted ? Object.assign(new Error("abortado"), { name: "AbortError" }) : e));
      if (body !== null) req.write(body);
      req.end();
    })) as typeof fetch;
}
