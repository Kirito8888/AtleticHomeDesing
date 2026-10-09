"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { Stepper } from "@/components/form/stepper";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";

type Values = { carbsThrowDayG: number | null; carbsHeavyDayG: number | null; carbsRestDayG: number | null };

/** Hidratos según el día del plan (vacío = usar el objetivo general). */
export function CarbsByDayForm({ initial }: { initial: Values }) {
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);
  const field = (k: keyof Values, label: string) => (
    <Field label={label} hint="Vacío = objetivo general">
      <Stepper label={label} value={v[k]} onChange={(x) => setV((cur) => ({ ...cur, [k]: x }))} step={10} max={1500} suffix="g" />
    </Field>
  );
  async function save() {
    setSaving(true);
    try {
      const body = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x == null || x <= 0 ? null : Math.round(x)]));
      await api("/api/settings/prefs", { method: "PATCH", body });
      toast.success("Hidratos por día guardados");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">Con tu plantilla metabólica: el objetivo de hidratos cambia si ese día toca jabalina, gimnasio o descanso.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {field("carbsThrowDayG", "Día de lanzamientos")}
        {field("carbsHeavyDayG", "Día de gimnasio")}
        {field("carbsRestDayG", "Día sin entreno")}
      </div>
      <Button type="button" variant="outline" onClick={save} disabled={saving}>
        Guardar hidratos por día
      </Button>
    </div>
  );
}

type Water = { waterMlPerKg: number; waterSessionExtraMl: number; waterHotExtraMl: number; hotTempC: number };

/** Objetivo de agua: ml por kg y extras por sesión y por calor. */
export function HydrationForm({ initial }: { initial: Water }) {
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);
  const field = (k: keyof Water, label: string, o: { step: number; min?: number; max: number; suffix: string }) => (
    <Field label={label}>
      <Stepper label={label} value={v[k]} onChange={(x) => x != null && setV((cur) => ({ ...cur, [k]: x }))} {...o} />
    </Field>
  );
  async function save() {
    setSaving(true);
    try {
      await api("/api/settings/prefs", { method: "PATCH", body: v });
      toast.success("Hidratación guardada");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">Agua al día: ml por kg de peso, más un extra los días con sesión y los de calor (máxima prevista en tu pista).</p>
      <div className="grid grid-cols-2 gap-3">
        {field("waterMlPerKg", "ml por kg", { step: 1, min: 20, max: 60, suffix: "ml" })}
        {field("waterSessionExtraMl", "Extra con sesión", { step: 100, max: 3000, suffix: "ml" })}
        {field("waterHotExtraMl", "Extra con calor", { step: 100, max: 3000, suffix: "ml" })}
        {field("hotTempC", "Calor desde", { step: 1, min: 15, max: 45, suffix: "°C" })}
      </div>
      <Button type="button" variant="outline" onClick={save} disabled={saving}>
        Guardar hidratación
      </Button>
    </div>
  );
}

type Track = { name: string; lat: number; lon: number } | null;

/** Pista habitual: nombre y coordenadas (con «usar mi ubicación» estando en la pista). */
export function TrackForm({ initial }: { initial: Track }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [lat, setLat] = useState(initial ? String(initial.lat) : "");
  const [lon, setLon] = useState(initial ? String(initial.lon) : "");
  const [busy, setBusy] = useState(false);
  const here = () => {
    if (!("geolocation" in navigator)) return toast.error("Este navegador no da la ubicación");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        // 3 decimales (~100 m): suficiente para el tiempo y no guarda más precisión de la necesaria
        setLat(p.coords.latitude.toFixed(3));
        setLon(p.coords.longitude.toFixed(3));
      },
      () => toast.error("No se pudo obtener la ubicación"),
      { enableHighAccuracy: false, timeout: 10000 },
    );
  };
  async function save(track: Track) {
    setBusy(true);
    try {
      await api("/api/settings/prefs", { method: "PATCH", body: { track } });
      toast.success(track ? "Pista guardada" : "Pista quitada");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const nLat = Number(lat.replace(",", "."));
  const nLon = Number(lon.replace(",", "."));
  const valid = name.trim() && lat && lon && Number.isFinite(nLat) && Number.isFinite(nLon) && Math.abs(nLat) <= 90 && Math.abs(nLon) <= 180;
  return (
    <div className="grid gap-3">
      <Field label="Nombre" htmlFor="track-name">
        <input id="track-name" className="h-10 w-full min-w-0 rounded-md border bg-transparent px-3 text-sm" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="p. ej. Pista municipal" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Latitud" htmlFor="track-lat">
          <input id="track-lat" inputMode="decimal" className="h-10 w-full min-w-0 rounded-md border bg-transparent px-3 text-sm" value={lat} onChange={(e) => setLat(e.target.value)} />
        </Field>
        <Field label="Longitud" htmlFor="track-lon">
          <input id="track-lon" inputMode="decimal" className="h-10 w-full min-w-0 rounded-md border bg-transparent px-3 text-sm" value={lon} onChange={(e) => setLon(e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={here}>
          Usar mi ubicación (estando en la pista)
        </Button>
        <Button type="button" size="sm" disabled={busy || !valid} onClick={() => save({ name: name.trim(), lat: nLat, lon: nLon })}>
          Guardar pista
        </Button>
        {initial ? (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => save(null)}>
            Quitar
          </Button>
        ) : null}
      </div>
    </div>
  );
}
