// OCR real con Tesseract y pdftoppm (v1.10). Se salta si no están instalados (en la CI están en el job E2E).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildPdf } from "@/test/pdf-fixture";

import { ocrImage, ocrPdf } from "./ocr";
import { parseNutritionLabel, parseReceiptText } from "./ocr-parse";

const has = (bin: string) => {
  try {
    execFileSync(bin, ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
const HAS_OCR = has("tesseract") && has("pdftoppm");

const ticket = buildPdf([
  [
    { x: 60, y: 80, size: 22, text: "DEPORTES EL ESTADIO" },
    { x: 60, y: 120, size: 18, text: "Fecha 03/10/2026" },
    { x: 60, y: 160, size: 18, text: "Clavos jabalina 15,00" },
    { x: 60, y: 200, size: 22, text: "TOTAL 27,90" },
  ],
]);

describe.skipIf(!HAS_OCR)("OCR en el servidor (Tesseract real)", () => {
  it("lee un PDF página a página y el ticket se interpreta", async () => {
    const pages = await ocrPdf(Buffer.from(ticket));
    expect(pages).toHaveLength(1);
    expect(parseReceiptText(pages[0])).toMatchObject({ amount: 27.9, date: "2026-10-03" });
  }, 60_000);

  it("lee una foto (PNG) de una etiqueta", async () => {
    const label = buildPdf([
      [
        { x: 60, y: 80, size: 20, text: "Valor energetico 1580 kJ / 375 kcal" },
        { x: 60, y: 120, size: 20, text: "Grasas 6,5 g" },
        { x: 60, y: 160, size: 20, text: "Proteinas 11 g" },
        { x: 60, y: 200, size: 20, text: "Sal 0,45 g" },
      ],
    ]);
    const dir = mkdtempSync(path.join(tmpdir(), "ocr-test-"));
    try {
      writeFileSync(path.join(dir, "l.pdf"), label);
      execFileSync("pdftoppm", ["-r", "150", "-png", "-singlefile", path.join(dir, "l.pdf"), path.join(dir, "l")]);
      const text = await ocrImage(readFileSync(path.join(dir, "l.png")));
      expect(parseNutritionLabel(text)).toMatchObject({ kcalPer100g: 375, fatPer100g: 6.5, proteinPer100g: 11, saltPer100g: 0.45 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("rechaza lo que no es imagen ni PDF", async () => {
    await expect(ocrImage(Buffer.from("hola"))).rejects.toMatchObject({ status: 415 });
  });
});
