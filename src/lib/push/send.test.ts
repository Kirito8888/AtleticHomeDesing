import { createDecipheriv, createECDH, hkdfSync, randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { buildPushRequest, generateVapidKeys, isAllowedPushEndpoint } from "./send";

const b64url = (b: Buffer) => b.toString("base64url");

/** Descifrado RFC 8291 (aes128gcm), lo mismo que hace el navegador al recibir el push. */
function decrypt(body: Buffer, uaPrivate: ReturnType<typeof createECDH>, authSecret: Buffer): string {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const ciphertext = body.subarray(21 + idlen);
  const uaPublic = uaPrivate.getPublicKey();
  const ecdhSecret = uaPrivate.computeSecret(asPublic);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", ecdhSecret, authSecret, keyInfo, 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
  const plain = Buffer.concat([decipher.update(ciphertext.subarray(0, ciphertext.length - 16)), decipher.final()]);
  // Relleno: el último registro termina en 0x02 seguido de ceros
  const end = plain.lastIndexOf(2);
  return plain.subarray(0, end).toString("utf8");
}

describe("Web Push", () => {
  // Un "navegador" de prueba: par de claves P-256 y secreto de autenticación
  const ua = createECDH("prime256v1");
  ua.generateKeys();
  const auth = randomBytes(16);
  const target = { endpoint: "https://push.example.test/send/abc123", p256dh: b64url(ua.getPublicKey()), auth: b64url(auth) };
  const vapid = { ...generateVapidKeys(), subject: "mailto:admin@example.com" };

  it("cifra el mensaje de forma que solo el navegador suscrito lo descifra", () => {
    const msg = { title: "Hoy: Fuerza A", body: "1 sesión planificada", url: "/training", tag: "digest" };
    const req = buildPushRequest(target, msg, vapid);
    expect(req.method).toBe("POST");
    expect(req.endpoint).toBe(target.endpoint);
    expect(req.headers["Content-Encoding"]).toBe("aes128gcm");
    expect(Number(req.headers.TTL)).toBe(86400);
    const body = Buffer.from(req.body as Buffer);
    expect(body.toString("utf8")).not.toContain("Fuerza A");
    expect(JSON.parse(decrypt(body, ua, auth))).toEqual(msg);
  });

  it("firma con VAPID para el origen del servicio de push", () => {
    const req = buildPushRequest(target, { title: "x", body: "y" }, vapid);
    const authz = String(req.headers.Authorization);
    expect(authz).toMatch(/^vapid t=.+, k=.+$/);
    const jwt = authz.match(/t=([^,]+)/)![1];
    const claims = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
    expect(claims.aud).toBe("https://push.example.test");
    expect(claims.sub).toBe("mailto:admin@example.com");
    expect(authz).toContain(`k=${vapid.publicKey}`);
  });

  it("otro navegador no puede descifrarlo", () => {
    const req = buildPushRequest(target, { title: "secreto", body: "z" }, vapid);
    const other = createECDH("prime256v1");
    other.generateKeys();
    expect(() => decrypt(Buffer.from(req.body as Buffer), other, auth)).toThrow();
  });
});

describe("endpoints de push permitidos (anti-SSRF)", () => {
  it("acepta los servicios de los navegadores", () => {
    for (const e of [
      "https://fcm.googleapis.com/fcm/send/abc:def",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
      "https://web.push.apple.com/QGuQyavXutnMH",
      "https://wns2-par02p.notify.windows.com/w/?token=xyz",
    ]) expect(isAllowedPushEndpoint(e)).toBe(true);
  });

  it("rechaza cualquier otro destino", () => {
    for (const e of [
      "http://fcm.googleapis.com/fcm/send/abc", // sin TLS
      "https://fcm.googleapis.com:8443/x", // otro puerto
      "https://fcm.googleapis.com.evil.com/x",
      "https://evil.com/fcm.googleapis.com",
      "https://user:pw@fcm.googleapis.com/x",
      "https://192.168.1.10/push",
      "https://localhost/push",
      "no es una url",
    ]) expect(isAllowedPushEndpoint(e)).toBe(false);
  });
});
