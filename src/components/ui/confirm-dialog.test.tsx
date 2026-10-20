// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ConfirmHost, confirmDialog } from "./confirm-dialog";

afterEach(cleanup);

const open = (o: Parameters<typeof confirmDialog>[0]) => {
  let p!: Promise<boolean>;
  act(() => {
    p = confirmDialog(o);
  });
  return p;
};

describe("ConfirmDialog", () => {
  it("muestra título, descripción y etiquetas, con el foco en Cancelar", async () => {
    render(<ConfirmHost />);
    const p = open({ title: "¿Borrar «X»?", description: "No se puede deshacer.", confirmLabel: "Borrar", destructive: true });
    expect(await screen.findByRole("alertdialog", { name: "¿Borrar «X»?" })).toBeTruthy();
    expect(screen.getByText("No se puede deshacer.")).toBeTruthy();
    expect(document.activeElement?.textContent).toBe("Cancelar");
    await act(async () => screen.getByRole("button", { name: "Cancelar" }).click());
    expect(await p).toBe(false);
  });

  it("Confirmar resuelve true y cierra", async () => {
    render(<ConfirmHost />);
    const p = open({ title: "¿Seguir?" });
    await act(async () => (await screen.findByRole("button", { name: "Seguir" })).click());
    expect(await p).toBe(true);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("Escape cancela", async () => {
    render(<ConfirmHost />);
    const p = open({ title: "¿Seguro?" });
    const dlg = await screen.findByRole("alertdialog");
    await act(async () => {
      dlg.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(await p).toBe(false);
  });

  it("dos peticiones seguidas se atienden en orden y con sus textos", async () => {
    render(<ConfirmHost />);
    const a = open({ title: "Primera", confirmLabel: "Sí A" });
    const b = open({ title: "Segunda", cancelLabel: "No B" });
    await act(async () => (await screen.findByRole("button", { name: "Sí A" })).click());
    expect(await a).toBe(true);
    expect(await screen.findByRole("alertdialog", { name: "Segunda" })).toBeTruthy();
    await act(async () => screen.getByRole("button", { name: "No B" }).click());
    expect(await b).toBe(false);
  });
});
