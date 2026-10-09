"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";

/** Enlace .ics para suscribirse desde Google/Apple Calendar (solo títulos y fechas). */
export function CalendarFeedSettings({ active: initialActive, lastUsedAt, study: initialStudy }: { active: boolean; lastUsedAt: string | null; study: boolean }) {
  const [active, setActive] = useState(initialActive);
  const [study, setStudy] = useState(initialStudy);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    if (active && !confirm("Se crea un enlace nuevo y el anterior deja de funcionar. ¿Seguir?")) return;
    setBusy(true);
    try {
      const r = await api<{ url: string }>("/api/calendar/feed", { method: "POST" });
      setUrl(r.url);
      setActive(true);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!confirm("¿Revocar el enlace? Los calendarios suscritos dejarán de actualizarse.")) return;
    setBusy(true);
    try {
      await api("/api/calendar/feed", { method: "DELETE" });
      setActive(false);
      setUrl(null);
      toast.success("Enlace revocado");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleStudy(on: boolean) {
    setStudy(on);
    try {
      await api("/api/settings/prefs", { method: "PATCH", body: { icsStudy: on } });
      toast.success(on ? "Clases y exámenes en el calendario" : "Clases y exámenes fuera del calendario");
    } catch (err) {
      setStudy(!on);
      toast.error((err as Error).message);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Enlace copiado");
    } catch {
      toast.error("No se pudo copiar: selecciónalo y cópialo a mano");
    }
  }

  return (
    <div className="grid gap-3 text-sm">
      <p className="text-muted-foreground">
        Tus sesiones planificadas y tus competiciones en Google Calendar o en el calendario del iPhone. Solo títulos y fechas: ni notas, ni marcas, ni datos de salud. Quien tenga el enlace ve esos títulos: no lo compartas.
      </p>
      <label className="flex items-center gap-2">
        <input type="checkbox" className="size-4" checked={study} onChange={(e) => toggleStudy(e.target.checked)} />
        Incluir mis clases y exámenes (solo la asignatura, sin aula)
      </label>
      {url ? (
        <div className="grid gap-2">
          <label htmlFor="ics-url" className="font-medium">
            Tu enlace (solo se muestra ahora)
          </label>
          <Input id="ics-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={copy}>
              Copiar enlace
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={url.replace(/^https?:/, "webcal:")}>Abrir en el calendario</a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Google Calendar (en el ordenador): Otros calendarios → + → Desde URL → pega el enlace.</p>
        </div>
      ) : active ? (
        <p>
          Enlace activo{lastUsedAt ? ` · último uso ${new Date(lastUsedAt).toLocaleString("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={active ? "outline" : "default"} onClick={create} disabled={busy}>
          {active ? "Crear un enlace nuevo" : "Crear enlace del calendario"}
        </Button>
        {active ? (
          <Button type="button" variant="ghost" onClick={revoke} disabled={busy}>
            Revocar
          </Button>
        ) : null}
      </div>
    </div>
  );
}
