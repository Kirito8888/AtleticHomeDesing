import "server-only";

import type { Browser } from "playwright-core";
import { getDocumentProxy } from "unpdf";

import { ApiError } from "@/lib/api";
import { allCodes, locateCodes, type Manual, renderManualHtml, samePages } from "@/lib/study/practical-manual";

const TIMEOUT_MS = 30_000;
let browser: Promise<Browser> | null = null;

export const PDF_MAX_WAITING = 3;
export const PDF_QUEUE_TIMEOUT_MS = 45_000;

export interface PdfQueue {
  /** Ejecuta `fn` cuando le toque el turno. 503 si hay demasiados esperando o si la espera pasa del tope. El turno se libera siempre. */
  run<T>(fn: () => Promise<T>): Promise<T>;
  /** Lanza 503 si ahora mismo una petición nueva no cabría (turno ocupado y cola llena). */
  assertCapacity(): void;
  stats(): { running: boolean; waiting: number };
}

/** Cola en memoria de un solo turno, con tope de espera y tiempo máximo en cola. Por proceso (no persistida). */
export function createPdfQueue(opts: { maxWaiting?: number; timeoutMs?: number } = {}): PdfQueue {
  const maxWaiting = opts.maxWaiting ?? PDF_MAX_WAITING;
  const timeoutMs = opts.timeoutMs ?? PDF_QUEUE_TIMEOUT_MS;
  let running = false;
  const waiting: Array<{ go: () => void; timer: ReturnType<typeof setTimeout> }> = [];
  const busy = () => new ApiError(503, "El generador de PDF está ocupado; inténtalo de nuevo en un minuto");

  const release = () => {
    const next = waiting.shift();
    if (next) {
      clearTimeout(next.timer);
      next.go(); // el turno pasa directamente al siguiente (running sigue true)
    } else running = false;
  };

  const acquire = (): Promise<void> => {
    if (!running) {
      running = true;
      return Promise.resolve();
    }
    if (waiting.length >= maxWaiting) return Promise.reject(busy());
    return new Promise<void>((resolve, reject) => {
      const entry = {
        go: () => resolve(),
        timer: setTimeout(() => {
          const i = waiting.indexOf(entry);
          if (i >= 0) waiting.splice(i, 1);
          reject(busy());
        }, timeoutMs),
      };
      waiting.push(entry);
    });
  };

  return {
    async run(fn) {
      await acquire();
      try {
        return await fn();
      } finally {
        release();
      }
    },
    assertCapacity() {
      if (running && waiting.length >= maxWaiting) throw busy();
    },
    stats: () => ({ running, waiting: waiting.length }),
  };
}

const pdfQueue = createPdfQueue();
export const assertPdfCapacity = () => pdfQueue.assertCapacity();

function getBrowser(): Promise<Browser> {
  browser ??= import("playwright-core").then(({ chromium }) => chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })).then((b) => {
    b.on("disconnected", () => (browser = null));
    return b;
  });
  browser.catch(() => (browser = null));
  return browser;
}

/** Un render sin pasar por la cola (el llamante ya tiene el turno). Sin JavaScript ni red. */
async function renderUnlocked(html: string): Promise<Uint8Array> {
  let b: Browser;
  try {
    b = await getBrowser();
  } catch {
    browser = null;
    throw new ApiError(503, "El generador de PDF no está disponible en este servidor");
  }
  const ctx = await b.newContext({ javaScriptEnabled: false });
  try {
    await ctx.route("**/*", (r) => (/^(about|data):/.test(r.request().url()) ? r.continue() : r.abort()));
    const page = await ctx.newPage();
    page.setDefaultTimeout(TIMEOUT_MS);
    await page.setContent(html, { waitUntil: "load" });
    return new Uint8Array(await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true }));
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

/** Renderiza HTML a PDF A4 con su propio turno de la cola (un render a la vez). */
export const renderPdf = (html: string): Promise<Uint8Array> => pdfQueue.run(() => renderUnlocked(html));

export async function pageTexts(pdf: Uint8Array): Promise<string[]> {
  const doc = await getDocumentProxy(new Uint8Array(pdf));
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    out.push(tc.items.map((it) => ("str" in it ? it.str : "")).join(""));
  }
  return out;
}

/**
 * Dos pasadas: la 1.ª mide en qué página cae cada receta; la 2.ª inyecta esos números. Si algo se movió, una 3.ª.
 * Todas las pasadas de un manual comparten UN turno de la cola (dos manuales no se intercalan; el 503 no llega a mitad).
 */
export function buildManualPdf(m: Manual, render: (html: string) => Promise<Uint8Array> = renderUnlocked, queue: PdfQueue = pdfQueue): Promise<Uint8Array> {
  return queue.run(() => buildPasses(m, render));
}

async function buildPasses(m: Manual, render: (html: string) => Promise<Uint8Array>): Promise<Uint8Array> {
  const codes = allCodes(m);
  let pages = locateCodes(await pageTexts(await render(renderManualHtml(m))), codes);
  let pdf = await render(renderManualHtml(m, pages));
  for (let i = 0; i < 2; i++) {
    const check = locateCodes(await pageTexts(pdf), codes);
    if (samePages(check, pages)) return pdf;
    pages = check;
    pdf = await render(renderManualHtml(m, pages));
  }
  return pdf;
}
