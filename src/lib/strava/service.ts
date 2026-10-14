import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { ApiError } from "@/lib/api";
import { publicUrl } from "@/lib/auth/access";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { recordEvent, type AuditContext } from "@/lib/security/audit";
import { openJson, sealJson } from "@/lib/security/data-key";
import { stravaToParsed, type StravaActivity, type StravaStreams } from "@/lib/strava/map";
import { STRAVA } from "@/lib/strava/policy";
import { previewParsed } from "@/lib/training/activity-import-service";
import { createTrainingSession, recomputeDailyLoads } from "@/lib/training/service";

/**
 * v1.10 · Strava por usuario (OAuth). Cada persona conecta su cuenta; los tokens van cifrados.
 * Las actividades se importan como sesiones con source = STRAVA: según sus condiciones de API, no
 * se envían a la IA ni las ve la entrenadora (ver src/lib/strava/policy.ts).
 */
type Tokens = { access: string; refresh: string; expiresAt: number };
type Fetcher = typeof fetch;

export const stravaConfigured = () => Boolean(env().STRAVA_CLIENT_ID && env().STRAVA_CLIENT_SECRET);
const base = () => env().STRAVA_BASE_URL.replace(/\/$/, "");
const STATE_MS = 10 * 60_000;

function secret() {
  const s = env().AUTH_SECRET;
  if (!s) throw new ApiError(503, "Falta AUTH_SECRET");
  return s;
}
const sign = (payload: string) => createHmac("sha256", secret()).update(`strava:${payload}`).digest("base64url");

/** `state` firmado (usuario + hora) contra CSRF: el callback solo vale para quien empezó la conexión. */
export function makeState(userId: string, now = Date.now()) {
  const payload = `${userId}.${now}`;
  return `${payload}.${sign(payload)}`;
}
export function checkState(state: string, userId: string, now = Date.now()) {
  const [uid, ts, sig] = state.split(".");
  if (!uid || !ts || !sig || uid !== userId) return false;
  const expected = Buffer.from(sign(`${uid}.${ts}`));
  const got = Buffer.from(sig);
  return expected.length === got.length && timingSafeEqual(expected, got) && now - Number(ts) < STATE_MS && now >= Number(ts);
}

export function authorizeUrl(userId: string) {
  if (!stravaConfigured()) throw new ApiError(503, "Strava no está configurado en este servidor (STRAVA_CLIENT_ID y STRAVA_CLIENT_SECRET)");
  if (!env().AUTH_URL) throw new ApiError(503, "Falta AUTH_URL (la dirección pública https de Atlenza): Strava la necesita para volver aquí");
  const q = new URLSearchParams({
    client_id: env().STRAVA_CLIENT_ID!,
    redirect_uri: publicUrl("/api/strava/callback"),
    response_type: "code",
    approval_prompt: "auto",
    scope: "activity:read_all",
    state: makeState(userId),
  });
  return `${base()}/oauth/authorize?${q}`;
}

async function call<T>(fetcher: Fetcher, url: string, init: RequestInit = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetcher(url, { ...init, redirect: "error", signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new ApiError(502, "Strava no responde");
  }
  if (r.status === 401) throw new ApiError(401, "Strava ha rechazado el acceso: vuelve a conectar tu cuenta", { code: "strava_auth" });
  if (r.status === 429) throw new ApiError(429, "Límite de peticiones de Strava alcanzado: se seguirá más tarde", { code: "strava_rate" });
  if (!r.ok) throw new ApiError(502, `Strava respondió ${r.status}`);
  return (await r.json()) as T;
}

type TokenResponse = { access_token: string; refresh_token: string; expires_at: number; athlete?: { id: number | string } };
const tokenRequest = (fetcher: Fetcher, body: Record<string, string>) =>
  call<TokenResponse>(fetcher, `${base()}/oauth/token`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_id: env().STRAVA_CLIENT_ID, client_secret: env().STRAVA_CLIENT_SECRET, ...body }) });

/** Callback de OAuth: cambia el código por los tokens y guarda la conexión. */
export async function connectStrava(userId: string, code: string, scope: string | null, fetcher: Fetcher = fetch, ctx: AuditContext = {}) {
  if (!scope?.includes("activity:read")) throw new ApiError(400, "Hace falta el permiso de leer tus actividades para importarlas");
  const t = await tokenRequest(fetcher, { code, grant_type: "authorization_code" });
  const athleteId = String(t.athlete?.id ?? "");
  if (!athleteId) throw new ApiError(502, "Strava no devolvió el atleta");
  const other = await prisma.stravaLink.findUnique({ where: { athleteId }, select: { userId: true } });
  if (other && other.userId !== userId) throw new ApiError(409, "Esa cuenta de Strava ya está conectada a otra cuenta de Atlenza");
  const tokenSealed = sealJson({ access: t.access_token, refresh: t.refresh_token, expiresAt: t.expires_at } satisfies Tokens);
  await prisma.stravaLink.upsert({ where: { userId }, create: { userId, athleteId, tokenSealed, scope }, update: { athleteId, tokenSealed, scope, lastError: null } });
  await recordEvent(userId, "STRAVA_LINKED", ctx);
}

/** Token de acceso vigente (se renueva si caduca en menos de un minuto). */
async function accessToken(userId: string, fetcher: Fetcher): Promise<string> {
  const link = await prisma.stravaLink.findUnique({ where: { userId } });
  if (!link) throw new ApiError(404, "No tienes Strava conectado");
  const tok = openJson<Tokens>(link.tokenSealed);
  if (tok.expiresAt * 1000 > Date.now() + 60_000) return tok.access;
  const t = await tokenRequest(fetcher, { grant_type: "refresh_token", refresh_token: tok.refresh });
  await prisma.stravaLink.update({ where: { userId }, data: { tokenSealed: sealJson({ access: t.access_token, refresh: t.refresh_token, expiresAt: t.expires_at } satisfies Tokens) } });
  return t.access_token;
}

/**
 * Importa las actividades nuevas (desde la última importada; la primera vez, los últimos 30 días).
 * `budget`: peticiones máximas a la API en esta pasada (Strava: 100 cada 15 min y 1.000 al día).
 */
export async function syncStrava(userId: string, opts: { fetcher?: Fetcher; budget?: number; now?: Date } = {}) {
  const fetcher = opts.fetcher ?? fetch;
  let budget = opts.budget ?? 40;
  const now = opts.now ?? new Date();
  const link = await prisma.stravaLink.findUnique({ where: { userId } });
  if (!link) throw new ApiError(404, "No tienes Strava conectado");
  let imported = 0;
  let skipped = 0;
  let newest = link.syncedUntil;
  try {
    const token = await accessToken(userId, fetcher);
    const auth = { headers: { authorization: `Bearer ${token}` } };
    const after = Math.floor((link.syncedUntil ?? new Date(now.getTime() - 30 * 864e5)).getTime() / 1000);
    let earliest: Date | null = null;
    for (let page = 1; budget > 0 && page <= 5; page++) {
      budget--;
      const list = await call<StravaActivity[]>(fetcher, `${base()}/api/v3/athlete/activities?after=${after}&per_page=50&page=${page}`, auth);
      if (!list.length) break;
      for (const a of [...list].sort((x, y) => x.start_date.localeCompare(y.start_date))) {
        const externalId = `strava:${a.id}`;
        const started = new Date(a.start_date);
        if (await prisma.trainingSession.findFirst({ where: { userId, OR: [{ externalId }, { startedAt: started }] }, select: { id: true } })) {
          skipped++;
          if (!newest || started > newest) newest = started;
          continue;
        }
        if (budget <= 0) break;
        budget--;
        const streams = await call<StravaStreams>(fetcher, `${base()}/api/v3/activities/${a.id}/streams?keys=time,distance,heartrate,latlng,altitude,cadence,velocity_smooth&key_by_type=true`, auth).catch((e) => {
          if (e instanceof ApiError && e.status === 429) throw e;
          return {} as StravaStreams; // sin streams se importa el resumen
        });
        const { payload } = await previewParsed(userId, stravaToParsed(a, streams));
        const created = await createTrainingSession(userId, null, { ...payload, title: (a.name?.trim() || payload.title || "Strava").slice(0, 120) });
        await prisma.trainingSession.update({ where: { id: created.id }, data: { source: STRAVA, externalId } });
        imported++;
        if (!newest || started > newest) newest = started;
        if (!earliest || started < earliest) earliest = started;
      }
      if (list.length < 50) break;
    }
    await prisma.stravaLink.update({ where: { userId }, data: { lastSyncAt: now, syncedUntil: newest, lastError: null } });
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : "Error al importar de Strava";
    await prisma.stravaLink.update({ where: { userId }, data: { lastError: msg.slice(0, 200), syncedUntil: newest } }).catch(() => {});
    if (!(e instanceof ApiError) || e.status !== 429) throw e;
  }
  return { imported, skipped };
}

/** Planificador (cada hora): todas las cuentas conectadas, con un tope global de peticiones. */
export async function runStravaSyncJob(fetcher: Fetcher = fetch) {
  if (!stravaConfigured()) return 0;
  const links = await prisma.stravaLink.findMany({ select: { userId: true } });
  let imported = 0;
  for (const l of links) {
    imported += (await syncStrava(l.userId, { fetcher, budget: 40 }).catch(() => ({ imported: 0 }))).imported;
  }
  return imported;
}

export async function stravaStatus(userId: string) {
  const link = await prisma.stravaLink.findUnique({ where: { userId }, select: { createdAt: true, lastSyncAt: true, lastError: true } });
  const sessions = link ? await prisma.trainingSession.count({ where: { userId, source: STRAVA } }) : 0;
  return { configured: stravaConfigured(), connected: Boolean(link), connectedAt: link?.createdAt ?? null, lastSyncAt: link?.lastSyncAt ?? null, lastError: link?.lastError ?? null, sessions };
}

/** Desconectar: revoca el permiso en Strava (si se puede) y, si se pide, borra las sesiones importadas. */
export async function disconnectStrava(userId: string, deleteSessions: boolean, fetcher: Fetcher = fetch, ctx: AuditContext = {}) {
  const link = await prisma.stravaLink.findUnique({ where: { userId } });
  if (!link) return { removed: false, deleted: 0 };
  try {
    const token = await accessToken(userId, fetcher);
    await call(fetcher, `${base()}/oauth/deauthorize`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
  } catch {
    // Si Strava no responde, se borra igualmente aquí; se puede revocar en strava.com/settings/apps
  }
  await prisma.stravaLink.delete({ where: { userId } });
  let deleted = 0;
  if (deleteSessions) {
    const first = await prisma.trainingSession.findFirst({ where: { userId, source: STRAVA }, orderBy: { date: "asc" }, select: { date: true } });
    deleted = (await prisma.trainingSession.deleteMany({ where: { userId, source: STRAVA } })).count;
    if (first) await recomputeDailyLoads(userId, first.date);
  }
  await recordEvent(userId, "STRAVA_UNLINKED", ctx, deleteSessions ? `${deleted} sesiones borradas` : "sesiones conservadas");
  return { removed: true, deleted };
}
