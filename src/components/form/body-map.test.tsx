// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BodyMap, painLevel } from "./body-map";

afterEach(cleanup);

describe("painLevel", () => {
  it("agrupa el dolor 1–10 en cuatro niveles (0 = sin marcar)", () => {
    expect([null, 0, 1, 3, 4, 6, 7, 8, 9, 10].map(painLevel)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
});

describe("BodyMap", () => {
  it("pinta las 17 zonas tocables con nombre, delante y detrás", () => {
    render(<BodyMap marked={[]} onPick={() => {}} />);
    const group = screen.getByRole("group", { name: "Mapa del cuerpo" });
    expect(within(group).getAllByRole("button")).toHaveLength(17);
    expect(screen.getByRole("button", { name: "Rodilla" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Isquiotibiales" })).toBeTruthy();
  });

  it("colorea según el dolor y lo anuncia en el nombre", () => {
    render(<BodyMap marked={["KNEE", "CALF"]} intensity={{ KNEE: 8, CALF: 2 }} onPick={() => {}} />);
    const knee = screen.getByRole("button", { name: "Rodilla (dolor 8/10)" });
    expect(knee.getAttribute("aria-pressed")).toBe("true");
    expect(knee.getAttribute("data-level")).toBe("3");
    expect(knee.querySelector(".fill-load-3")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Gemelo (dolor 2/10)" }).getAttribute("data-level")).toBe("1");
    expect(screen.getByRole("button", { name: "Pie" }).getAttribute("data-level")).toBe("0");
    expect(screen.getByRole("list", { name: "Escala de dolor" }).textContent).toContain("Muy alto");
  });

  it("sin intensidad, las zonas marcadas usan el nivel moderado y no hay leyenda", () => {
    render(<BodyMap marked={["ELBOW"]} onPick={() => {}} />);
    expect(screen.getByRole("button", { name: "Codo (marcada)" }).getAttribute("data-level")).toBe("2");
    expect(screen.queryByRole("list", { name: "Escala de dolor" })).toBeNull();
  });

  it("clic, Enter y espacio llaman a onPick con la zona", () => {
    const onPick = vi.fn();
    render(<BodyMap marked={[]} onPick={onPick} />);
    fireEvent.click(screen.getByRole("button", { name: "Glúteo" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Hombro" }), { key: "Enter" });
    fireEvent.keyDown(screen.getByRole("button", { name: "Tobillo" }), { key: " " });
    expect(onPick.mock.calls.map((c) => c[0])).toEqual(["GLUTE", "SHOULDER", "ANKLE"]);
  });
});
