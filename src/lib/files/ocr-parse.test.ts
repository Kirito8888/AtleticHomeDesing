import { describe, expect, it } from "vitest";

import { parseEsNumber, parseNutritionLabel, parseReceiptText } from "./ocr-parse";

describe("números en formato español", () => {
  it("entiende miles y decimales", () => {
    expect(parseEsNumber("1.234,56")).toBe(1234.56);
    expect(parseEsNumber("12,5")).toBe(12.5);
    expect(parseEsNumber("12.50 €")).toBe(12.5);
    expect(parseEsNumber("abc")).toBeNull();
  });
});

describe("tickets", () => {
  it("total, fecha y comercio de un ticket típico", () => {
    const text = `DEPORTES EL ESTADIO S.L.
CIF B12345678
C/ Mayor 1, Madrid
FACTURA SIMPLIFICADA
Fecha: 03/10/2026 18:22
Clavos jabalina 2 x 7,50 15,00
Cinta 12,90
SUBTOTAL 23,06
IVA 21% 4,84
TOTAL 27,90
ENTREGADO 30,00
CAMBIO 2,10`;
    expect(parseReceiptText(text)).toEqual({ amount: 27.9, date: "2026-10-03", merchant: "DEPORTES EL ESTADIO S.L." });
  });

  it("sin línea de total usa la mayor cantidad; fechas con año corto", () => {
    expect(parseReceiptText("Fisioterapia Norte\n12-09-26\nSesión 45,00\nVendaje 5,00")).toEqual({ amount: 45, date: "2026-09-12", merchant: "Fisioterapia Norte" });
    expect(parseReceiptText("nada útil")).toMatchObject({ amount: null, date: null });
  });
});

describe("etiquetas nutricionales", () => {
  it("lee la columna por 100 g y separa saturadas de grasas y azúcares de hidratos", () => {
    const text = `Información nutricional Por 100 g Por ración (30 g)
Valor energético 1580 kJ / 375 kcal 474 kJ / 113 kcal
Grasas 6,5 g 2,0 g
de las cuales saturadas 1,2 g 0,4 g
Hidratos de carbono 62 g 18,6 g
de los cuales azúcares 21 g 6,3 g
Fibra alimentaria 8,0 g 2,4 g
Proteínas 11 g 3,3 g
Sal 0,45 g 0,14 g
Calcio 120 mg (15%)
Hierro 4,2 mg`;
    expect(parseNutritionLabel(text)).toEqual({ kcalPer100g: 375, fatPer100g: 6.5, satFatPer100g: 1.2, carbsPer100g: 62, sugarsPer100g: 21, fiberPer100g: 8, proteinPer100g: 11, saltPer100g: 0.45, calciumPer100g: 120, ironPer100g: 4.2 });
  });

  it("convierte desde kJ si no viene kcal y entiende «<0,5 g» como 0", () => {
    expect(parseNutritionLabel("Energía 418 kJ\nSal <0,01 g")).toEqual({ kcalPer100g: 100, saltPer100g: 0 });
  });
});
