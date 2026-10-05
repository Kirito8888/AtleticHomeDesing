"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (opts: { formats: string[] }) => BarcodeDetectorLike;

/**
 * Escáner con la Barcode Detection API (Chrome/Edge Android, Safari 17+ con
 * flag). Si no está disponible o no hay permiso de cámara, queda la entrada
 * manual del código. La cámara requiere HTTPS (o localhost).
 */
export function BarcodeScanner({ onCode }: { onCode: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const supported = typeof window !== "undefined" && "BarcodeDetector" in window;

  useEffect(() => {
    if (!active) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const Detector = (window as unknown as { BarcodeDetector: BarcodeDetectorCtor }).BarcodeDetector;
    const detector = new Detector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        const tick = async () => {
          if (stopped) return;
          try {
            const codes = await detector.detect(video);
            if (codes[0]?.rawValue) {
              stopped = true;
              setActive(false);
              onCode(codes[0].rawValue);
              return;
            }
          } catch {
            /* frame no listo: seguir */
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        setError("No se pudo acceder a la cámara. Revisa los permisos o introduce el código.");
        setActive(false);
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [active, onCode]);

  return (
    <div className="grid gap-3">
      {supported ? (
        <>
          <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-muted">
            <video ref={videoRef} className="size-full object-cover" playsInline muted />
            {!active ? (
              <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
                <CameraOff className="size-8" aria-hidden />
              </div>
            ) : (
              <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-destructive/80" aria-hidden />
            )}
          </div>
          <Button type="button" onClick={() => { setError(null); setActive((a) => !a); }}>
            <Camera /> {active ? "Detener" : "Escanear con la cámara"}
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Este navegador no soporta la lectura de códigos con la cámara. Escribe el código EAN:</p>
      )}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) onCode(manual.trim());
        }}
      >
        <Input inputMode="numeric" aria-label="Código de barras" placeholder="8480000…" value={manual} onChange={(e) => setManual(e.target.value.replace(/\D/g, ""))} />
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </form>
    </div>
  );
}
