// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { computeIsak, type IsakInput } from "@/lib/health/isak";
import type { CompositionPoint } from "@/lib/health/isak-chart";

// El gráfico recharts se carga aparte (dynamic, ssr:false): aquí basta saber que se monta.
vi.mock("next/dynamic", () => ({ default: () => (p: { unit: string }) => <div data-testid="evolucion" data-unit={p.unit} /> }));

import { CompositionEvolution, MassBreakdown, Somatochart } from "./body-composition-charts";

afterEach(cleanup);

const base: IsakInput = {
  date: "2026-11-09", sex: "M", weightKg: 75, heightCm: 178,
  triceps: 10, subscapular: 9, biceps: 5, iliacCrest: 12, supraspinale: 7, abdominal: 12, frontThigh: 11, medialCalf: 6,
  armFlexedGirth: 33.5, calfGirth: 37, humerusBreadth: 7, femurBreadth: 9.8, wristBreadth: 5.7,
};
const pt = (id: string, over: Partial<IsakInput> = {}): CompositionPoint => {
  const i = { ...base, ...over };
  const r = computeIsak(i);
  return { id, date: i.date, weightKg: i.weightKg, somatotype: r.somatotype, masses: r.masses };
};
const two = [pt("a"), pt("b", { date: "2026-12-09", weightKg: 77, triceps: 8, abdominal: 10 })];

describe("Somatochart", () => {
  it("sin mediciones muestra el aviso", () => {
    render(<Somatochart points={[]} />);
    expect(screen.getByText(/Aún no hay mediciones/)).toBeTruthy();
  });
  it("un registro: punto sin trayectoria", () => {
    render(<Somatochart points={[pt("a")]} />);
    expect(screen.getAllByTestId("punto-somato")).toHaveLength(1);
    expect(screen.queryByTestId("trayectoria")).toBeNull();
  });
  it("dos registros: dos puntos, trayectoria y descripción accesible", () => {
    render(<Somatochart points={two} />);
    expect(screen.getAllByTestId("punto-somato")).toHaveLength(2);
    expect(screen.getByTestId("trayectoria")).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(/2 mediciones.*X.*Y/);
  });
});

describe("MassBreakdown", () => {
  it("muestra kg y % de las 4 masas, sin variación con una sola medición", () => {
    render(<MassBreakdown points={[pt("a")]} />);
    for (const n of ["Masa grasa", "Masa muscular", "Masa ósea", "Masa residual"]) expect(screen.getByText(n)).toBeTruthy();
    expect(screen.getByText(/sin medición previa/)).toBeTruthy();
    expect(screen.getAllByText("—")).toHaveLength(4);
  });
  it("con dos mediciones enseña la variación con signo", () => {
    render(<MassBreakdown points={two} />);
    expect(screen.getByText(/variación frente al/)).toBeTruthy();
    expect(screen.getAllByText(/ pp$/).length).toBe(4);
  });
});

describe("CompositionEvolution", () => {
  it("un registro: sin gráfica pero con tabla de datos", () => {
    render(<CompositionEvolution points={[pt("a")]} />);
    expect(screen.queryByTestId("evolucion")).toBeNull();
    expect(screen.getByText(/una sola medición/)).toBeTruthy();
  });
  it("dos registros: gráfica, cambio kg/% y tabla con las filas", () => {
    render(<CompositionEvolution points={two} />);
    expect(screen.getByTestId("evolucion").getAttribute("data-unit")).toBe("kg");
    fireEvent.click(screen.getByRole("button", { name: "Porcentaje" }));
    expect(screen.getByTestId("evolucion").getAttribute("data-unit")).toBe("%");
    expect(screen.getByText("2026-12-09")).toBeTruthy();
    expect(screen.getByText("2026-11-09")).toBeTruthy();
    expect(screen.getByText("77")).toBeTruthy();
  });
});
