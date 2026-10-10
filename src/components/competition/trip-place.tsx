"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";

/** v1.8 · Coordenadas del lugar de la competición (para el pronóstico). Opcionales. */
export function TripPlace({ eventId, lat: lat0, lon: lon0 }: { eventId: string; lat: number | null; lon: number | null }) {
  const router = useRouter();
  const [lat, setLat] = useState(lat0 != null ? String(lat0) : "");
  const [lon, setLon] = useState(lon0 != null ? String(lon0) : "");
  const [busy, setBusy] = useState(false);
  const nLat = Number(lat.replace(",", "."));
  const nLon = Number(lon.replace(",", "."));
  const valid = lat && lon && Number.isFinite(nLat) && Number.isFinite(nLon) && Math.abs(nLat) <= 90 && Math.abs(nLon) <= 180;
  async function save(place: { lat: number | null; lon: number | null }) {
    setBusy(true);
    try {
      await api(`/api/planning/events/${eventId}`, { method: "PATCH", body: place });
      toast.success(place.lat == null ? "Lugar quitado" : "Lugar guardado");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-2 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Latitud del estadio" htmlFor="trip-lat">
          <Input id="trip-lat" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="39.470" />
        </Field>
        <Field label="Longitud del estadio" htmlFor="trip-lon">
          <Input id="trip-lon" inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} placeholder="-0.376" />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">Cópialas del mapa (mantén pulsado sobre el estadio). Solo se envían a Open-Meteo para el pronóstico.</p>
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={busy || !valid} onClick={() => save({ lat: Math.round(nLat * 1000) / 1000, lon: Math.round(nLon * 1000) / 1000 })}>
          Guardar lugar
        </Button>
        {lat0 != null ? (
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => save({ lat: null, lon: null })}>
            Quitar
          </Button>
        ) : null}
      </div>
    </div>
  );
}
