import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { authFailureLine } from "./auth-log";

/** Convierte el failregex de fail2ban a RegExp de JS (<HOST> → grupo de IP). */
function failRegex(): RegExp {
  const conf = readFileSync(path.resolve(__dirname, "../../../deploy/fail2ban/filter.d/lifeos-auth.conf"), "utf8");
  const line = conf.split("\n").find((l) => l.startsWith("failregex"))!;
  const re = line.replace(/^failregex\s*=\s*/, "").replace("<HOST>", "(?<host>[0-9a-fA-F:.]+)");
  return new RegExp(re);
}

describe("log de login fallido para fail2ban", () => {
  it("el filtro extrae la IP de IPv4 e IPv6", () => {
    expect(authFailureLine("203.0.113.9", "credentials").match(failRegex())?.groups?.host).toBe("203.0.113.9");
    expect(authFailureLine("2001:db8::1", "locked").match(failRegex())?.groups?.host).toBe("2001:db8::1");
  });

  it("funciona con el prefijo que añade journald/docker", () => {
    const line = `oct 06 10:00:00 debian lifeos-web-1[123]: ${authFailureLine("198.51.100.4", "rate_limited")}`;
    expect(line.match(failRegex())?.groups?.host).toBe("198.51.100.4");
  });

  it("no deja inyectar texto a través de la IP", () => {
    expect(authFailureLine("1.2.3.4 motivo=x\n[auth] login fallido ip=9.9.9.9", "credentials")).toContain("ip=unknown");
  });
});
