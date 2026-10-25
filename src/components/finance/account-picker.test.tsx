// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { AccountPicker, pickAccount } from "./account-picker";

afterEach(cleanup);

const accounts = [
  { id: "a", name: "Corriente", type: "ASSET", balanceCents: 10000 },
  { id: "b", name: "Visa", type: "LIABILITY", balanceCents: -2000 },
];

function Harness({ list = accounts, initial }: { list?: typeof accounts; initial: string | null }) {
  const [v, setV] = useState(initial);
  return <AccountPicker accounts={list} value={v} onChange={setV} label="Desde" />;
}

describe("pickAccount", () => {
  it("usa la recordada si sigue activa", () => expect(pickAccount(accounts, "b")).toBe("b"));
  it("cae a la primera si la recordada ya no existe o no hay", () => {
    expect(pickAccount(accounts, "zzz")).toBe("a");
    expect(pickAccount(accounts, null)).toBe("a");
  });
  it("con una sola cuenta, esa; sin cuentas, null", () => {
    expect(pickAccount([accounts[1]], null)).toBe("b");
    expect(pickAccount([], "a")).toBeNull();
  });
});

describe("AccountPicker", () => {
  it("lista las cuentas, marca la preseleccionada y la tarjeta", () => {
    render(<Harness initial="a" />);
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByRole("radio", { name: /Corriente/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: /Visa · tarjeta/ }).getAttribute("aria-checked")).toBe("false");
  });
  it("al tocar otra cambia la selección y el campo oculto `account`", () => {
    const { container } = render(<Harness initial="a" />);
    fireEvent.click(screen.getByRole("radio", { name: /Visa/ }));
    expect(screen.getByRole("radio", { name: /Visa/ }).getAttribute("aria-checked")).toBe("true");
    expect((container.querySelector('input[name="account"]') as HTMLInputElement).value).toBe("b");
  });
  it("las opciones miden al menos 44 px (min-h-11)", () => {
    render(<Harness initial="a" />);
    for (const r of screen.getAllByRole("radio")) expect(r.className).toContain("min-h-11");
  });
});
