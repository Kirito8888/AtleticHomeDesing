import { describe, expect, it } from "vitest";

import { extractJson, isPrivateAddress, normalizeUrl, providerError } from "./provider";

describe("URL de proveedores (SSRF)", () => {
  it("rechaza direcciones internas, locales y reservadas", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.1", "192.168.1.10", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "224.0.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "172.32.0.1", "2606:4700::1111", "104.18.1.1"]) expect(isPrivateAddress(ip), ip).toBe(false);
    expect(isPrivateAddress("no-es-ip")).toBe(true);
  });

  it("normaliza la URL y descarta credenciales, consulta o fragmento", () => {
    expect(normalizeUrl("https://api.openai.com/v1/")).toBe("https://api.openai.com/v1");
    expect(normalizeUrl(" http://ollama:11434/v1 ")).toBe("http://ollama:11434/v1");
    expect(normalizeUrl("https://user:pw@x.dev/v1")).toBeNull();
    expect(normalizeUrl("https://x.dev/v1?a=1")).toBeNull();
    expect(normalizeUrl("no es url")).toBeNull();
    expect(normalizeUrl("")).toBeNull();
  });
});

describe("errores del proveedor", () => {
  it("nunca repiten la clave", () => {
    const key = "sk-proj-ABCDEFGHIJKLMNOPQRSTUVWX1234";
    const e = providerError("OPENAI", 400, `Incorrect API key provided: ${key}. Otra: AIzaSyD-abcdefghijklmnop`, key);
    expect(e.message).not.toContain(key);
    expect(e.message).not.toContain("AIzaSyD-abcdefghijklmnop");
    expect(e.message).toContain("•••");
  });

  it("401/403 → clave rechazada; 429 → límite", () => {
    expect(providerError("ANTHROPIC", 401, "x", "k").message).toMatch(/rechaza la clave/);
    expect(providerError("GEMINI", 429, "x", "k").status).toBe(429);
  });
});

describe("JSON de los modelos", () => {
  it("acepta JSON limpio, entre ``` o con texto alrededor", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(extractJson('Aquí tienes: {"a":3} ¡suerte!')).toEqual({ a: 3 });
    expect(() => extractJson("nada")).toThrow();
  });
});
