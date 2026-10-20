import { afterEach, describe, expect, it, vi } from "vitest";

import { requestContext } from "@/lib/request-context";

import { formatLine, log, scrubText } from "./log";

const SECRETS = ["ana.garcia@correo.es", "Bearer abc.def.ghi", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.firmafirmafirma", "192.168.1.77", "2001:db8:85a3::8a2e:370:7334", "hunter2", "dolor de rodilla", "cookie=authjs.session-token", "Mozilla/5.0"];

function capture() {
  const lines: string[] = [];
  const push = (l: unknown) => void lines.push(String(l));
  vi.spyOn(console, "info").mockImplementation(push);
  vi.spyOn(console, "warn").mockImplementation(push);
  vi.spyOn(console, "error").mockImplementation(push);
  return lines;
}

describe("logger JSON (Bloque 8)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("escribe una línea JSON con nivel, mensaje, id de petición y ruta anónima", () => {
    const lines = capture();
    requestContext.run({ method: "POST", path: "/api/training/sessions/clx9a8b7c6d5e4f3g2h1i0j9k", reqId: "req-12345678" }, () => log.warn("fallo", { status: 502 }));
    const j = JSON.parse(lines[0]);
    expect(j).toMatchObject({ level: "warn", msg: "fallo", reqId: "req-12345678", route: "/api/training/sessions/[id]", method: "POST", status: 502 });
    expect(typeof j.t).toBe("string");
  });

  it("no escribe datos personales: emails, tokens, IP, cuerpos, cabeceras, cookies ni salud", () => {
    const lines = capture();
    const prismaLike = Object.assign(new Error(`Invalid \`prisma.user.update()\` invocation:\n{ where: { email: "ana.garcia@correo.es" }, data: { nota: "dolor de rodilla", password: "hunter2" } }`), { code: "P2002", meta: { target: ["ana.garcia@correo.es"] } });
    requestContext.run({ method: "GET", path: "/api/health/cycle?email=ana.garcia@correo.es", reqId: "req-12345678" }, () => {
      log.error(`falló para ana.garcia@correo.es desde 192.168.1.77 con Bearer abc.def.ghi y 2001:db8:85a3::8a2e:370:7334`, {
        err: prismaLike,
        // claves que no están en la lista blanca: deben descartarse aunque se cuelen con un cast
        ...({ email: "ana.garcia@correo.es", body: { nota: "dolor de rodilla" }, headers: { cookie: "cookie=authjs.session-token", "user-agent": "Mozilla/5.0" }, token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.firmafirmafirma", password: "hunter2" } as object),
      });
    });
    const out = lines.join("\n");
    for (const s of SECRETS) expect(out, s).not.toContain(s);
    expect(out).not.toContain("stack");
    const j = JSON.parse(lines[0]);
    expect(Object.keys(j).sort()).toEqual(["err", "level", "method", "msg", "reqId", "route", "t"]);
    expect(j.route).toBe("/api/health/cycle");
    expect(j.err).toMatchObject({ name: "Error", code: "P2002" });
  });

  it("una cadena como error también se sanea; un id de petición raro no inyecta líneas", () => {
    const line = formatLine("error", "x\nfalso: {\"level\":\"info\"}", { err: "boom ana@x.es\nsegunda línea", reqId: "a\nb" });
    expect(line.split("\n")).toHaveLength(1);
    expect(line).not.toContain("ana@x.es");
  });

  it("scrubText recorta y tapa valores", () => {
    expect(scrubText("ab ".repeat(200)).length).toBe(200);
    expect(scrubText('no existe "valor secreto" y {a: 1}')).toBe("no existe […] y {…}");
  });
});
