// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ChartDataTable } from "./chart-data-table";

afterEach(cleanup);

describe("ChartDataTable", () => {
  it("expone caption, cabeceras de columna y de fila, y una región con nombre", () => {
    render(<ChartDataTable summary="Ver como tabla" caption="Datos de prueba" columns={["Mes", "A", "B"]} rows={[["sep", "1", "2"], ["oct", "3", "4"]]} />);
    expect(screen.getByRole("table", { name: "Datos de prueba" })).toBeTruthy();
    expect(screen.getAllByRole("columnheader").map((h) => h.getAttribute("scope"))).toEqual(["col", "col", "col"]);
    expect(screen.getByRole("rowheader", { name: "oct" }).getAttribute("scope")).toBe("row");
    expect(screen.getByRole("region", { name: "Datos de prueba" }).getAttribute("tabindex")).toBe("0");
    expect(screen.getByText("Ver como tabla").tagName).toBe("SUMMARY");
  });
});
