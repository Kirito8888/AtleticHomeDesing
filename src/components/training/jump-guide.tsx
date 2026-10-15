import { formatNum } from "@/lib/format";
import { frameErrorCm } from "@/lib/training/jump";

const FPS_TABLE = [25, 50, 100, 120, 240] as const;

/** Guía estática para grabar y subir el vídeo del salto con la mayor precisión posible. */
export function JumpGuide() {
  return (
    <section aria-labelledby="jump-guide" className="mt-8 grid gap-4 border-t pt-6 text-sm">
      <h2 id="jump-guide" className="text-base font-semibold">
        Cómo grabar y subir el vídeo para medir bien
      </h2>

      <div className="grid gap-1.5">
        <h3 className="font-medium">1 · Cuantos más fps, mejor</h3>
        <p className="text-muted-foreground">Error de ±1 fotograma en un salto de 0,5 s (30,7 cm):</p>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 tabular-nums" aria-label="Error por fps">
          {FPS_TABLE.map((f) => (
            <li key={f}>
              {f} fps: ± {formatNum(frameErrorCm(f, 0.5), 1)} cm
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground">
          En el iPhone: Ajustes › Cámara › Grabar vídeo › 4K a 100 o 120 fps (necesita «Alta eficiencia»), o Cámara lenta a 240 fps. Con 30 fps o menos el error es demasiado grande.
        </p>
      </div>

      <div className="grid gap-1.5">
        <h3 className="font-medium">2 · Encuadre</h3>
        <p className="text-muted-foreground">Móvil fijo (trípode o apoyado) a la altura de los pies, a 2–3 m, de lado. Los pies y el suelo deben verse en todo momento, con buena luz.</p>
      </div>

      <div className="grid gap-1.5">
        <h3 className="font-medium">3 · Cómo saltar</h3>
        <p className="text-muted-foreground">
          Sin pasos previos ni apoyarte en nada. CMJ con las manos en la cintura (Abalakov con brazos). Cae en el mismo sitio con las piernas extendidas: flexionar antes de tocar el suelo alarga el vuelo y exagera la altura.
        </p>
      </div>

      <div className="grid gap-1.5">
        <h3 className="font-medium">4 · Súbelo sin perder fps</h3>
        <p className="text-muted-foreground">
          Si lo eliges desde Fotos, iOS puede convertirlo y quitarle fotogramas (un vídeo de 100 fps llega como uno de 25). Es más seguro: en Fotos, Compartir › «Guardar en Archivos»; y en Atlenza, «Elegir archivo» › «Explorar» y busca el vídeo en Archivos. Atlenza te avisa si los fps que mide no coinciden con los que indicas. Haz la medida desde el iPhone: muchos ordenadores no leen el vídeo HEVC.
        </p>
      </div>

      <div className="grid gap-1.5">
        <h3 className="font-medium">5 · Cámara lenta</h3>
        <p className="text-muted-foreground">
          La cámara lenta del iPhone solo ralentiza un tramo del vídeo. Si grabaste así, en Fotos › Editar amplía el tramo lento para que cubra todo el salto y, en Atlenza, marca «Sí» en cámara lenta con 120 o 240 fps. Si el vídeo va a velocidad real (por ejemplo, 4K a 100 fps), marca «No».
        </p>
      </div>

      <div className="grid gap-1.5">
        <h3 className="font-medium">6 · Marca los fotogramas</h3>
        <p className="text-muted-foreground">Despegue: primer fotograma con los dos pies en el aire. Aterrizaje: primer fotograma en el que algún pie toca el suelo. Usa el deslizador y los botones ±1.</p>
      </div>

      <div className="grid gap-1.5">
        <h3 className="font-medium">7 · No lo compares con la tabla</h3>
        <p className="text-muted-foreground">
          Una tabla o un Sargent mide hasta dónde llega la mano, con brazo, hombro e inclinación incluidos; el tiempo de vuelo mide lo que sube el centro de masas. Con la misma persona, la tabla da más. Compara siempre con el mismo método.
        </p>
      </div>
    </section>
  );
}
