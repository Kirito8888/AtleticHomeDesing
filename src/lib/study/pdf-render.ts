import "server-only";

import type { Browser } from "playwright-core";
import { getDocumentProxy } from "unpdf";

import { ApiError } from "@/lib/api";
import { allCodes, locateCodes, type Manual, renderManualHtml, samePages } from "@/lib/study/practical-manual";

const TIMEOUT_MS = 30_000;
let browser: Promise<Browser> | null = null;
let queue: Promise<unknown> = Promise.resolve();

function getBrowser(): Promise<Browser> {
  browser ??= import("playwright-core").then(({ chromium }) => chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })).then((b) => {
    b.on("disconnected", () => (browser = null));
    return b;
  });
  browser.catch(() => (browser = null));
  return browser;
}

/** Renderiza HTML a PDF A4. Un render a la vez; sin JavaScript ni red. Todo es E/S asíncrona (proceso aparte). */
export function renderPdf(html: string): Promise<Uint8Array> {
  const job = queue.then(async () => {
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
  });
  queue = job.catch(() => undefined);
  return job;
}

export async function pageTexts(pdf: Uint8Array): Promise<string[]> {
  const doc = await getDocumentProxy(new Uint8Array(pdf));
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    out.push(tc.items.map((it) => ("str" in it ? it.str : "")).join(""));
  }
  return out;
}

/** Dos pasadas: la 1.ª mide en qué página cae cada receta; la 2.ª inyecta esos números. Si algo se movió, una 3.ª. */
export async function buildManualPdf(m: Manual, render: (html: string) => Promise<Uint8Array> = renderPdf): Promise<Uint8Array> {
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
