import { formatNum } from "@/lib/format";
import { frameErrorCm, jumpHeight, takeoffVelocity } from "@/lib/training/jump";

const FPS_TABLE = [25, 50, 100, 120, 240] as const;
const EXAMPLE_S = 0.65;

function Section({ title, open = false, children }: { title: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="group rounded-lg border">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 font-medium [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="grid gap-3 border-t px-3 py-3 text-muted-foreground">{children}</div>
    </details>
  );
}

const H = ({ children }: { children: React.ReactNode }) => <h4 className="text-foreground font-medium">{children}</h4>;
const List = ({ items }: { items: React.ReactNode[] }) => (
  <ul className="grid list-disc gap-1 pl-5">
    {items.map((it, i) => (
      <li key={i}>{it}</li>
    ))}
  </ul>
);

/** Guía estática (móvil, tablet y ordenador) para grabar, subir, ajustar y entender el cálculo del test de salto. */
export function JumpGuide() {
  return (
    <section aria-labelledby="jump-guide" className="mt-8 grid gap-3 border-t pt-6 text-sm">
      <h2 id="jump-guide" className="text-base font-semibold">
        Cómo grabar y subir el vídeo para medir bien
      </h2>
      <p className="text-muted-foreground">Funciona con iPhone, Android, cámaras de acción y vídeo de un ordenador. El vídeo se queda en tu dispositivo: no se sube a ningún servidor.</p>

      <Section title="1 · Colocar la cámara y ajustes de grabación" open>
        <H>Colocación</H>
        <List
          items={[
            "Móvil fijo, en trípode o apoyado, sin que nadie lo sujete. Si se mueve, los fotogramas no son comparables.",
            "De lado (perpendicular a tu salto), a 2–3 m, con el objetivo a la altura de tu cadera. Con la cámara más alta o más baja los pies parecen subir o bajar y el despegue es difícil de ver.",
            "Móvil en vertical: cabe todo el cuerpo con 1 m de margen por encima de la cabeza y el suelo se ve.",
            "Usa la cámara principal (1×). Sin gran angular ni zoom digital: deforman los bordes.",
            "Los pies y el suelo, con su sombra, deben verse siempre. Fondo liso y luz clara y uniforme (mejor exterior o sala muy iluminada): con poca luz el obturador se alarga y el movimiento sale borroso.",
            "Empieza a grabar 2 s antes y para 2 s después. Una grabación corta pesa poco y se carga más rápido.",
          ]}
        />
        <H>Ajustes de la cámara</H>
        <p>Cuantos más fps, más preciso. Error de ±1 fotograma en un salto de 0,5 s:</p>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 tabular-nums" aria-label="Error por fps">
          {FPS_TABLE.map((f) => (
            <li key={f}>
              {f} fps: ± {formatNum(frameErrorCm(f, 0.5), 1)} cm
            </li>
          ))}
        </ul>
        <p className="text-foreground font-medium">iPhone</p>
        <List
          items={[
            "Ajustes › Cámara › Grabar vídeo: elige la opción con más fps (según el modelo, 1080p/4K a 60, 100 o 120 fps). Las opciones de más fps requieren «Alta eficiencia» en Ajustes › Cámara › Formatos.",
            "O Ajustes › Cámara › Grabar cámara lenta: 1080p a 120 o 240 fps. Graba en el modo Cámara lenta de la app Cámara.",
            "Bloquea enfoque y exposición: mantén pulsado sobre ti hasta ver «Bloqueo AE/AF». Evita el modo Acción, Cinemático y los filtros.",
          ]}
        />
        <p className="text-foreground font-medium">Android</p>
        <List
          items={[
            "En la app Cámara, abre los ajustes de vídeo y elige el máximo de fps disponible (60 o 120 en la resolución que lo permita). El modo «Cámara lenta» suele grabar a 120 o 240 fps.",
            "Evita los modos de cámara lenta extrema que graban una fracción de segundo o interpolan fotogramas (p. ej. 960 fps): el vuelo completo puede no caber y los fotogramas no son reales.",
            "Desactiva la estabilización avanzada y el HDR de vídeo si la cámara lo permite; bloquea el enfoque tocando sobre ti.",
          ]}
        />
        <p className="text-foreground font-medium">Otras cámaras (GoPro, compactas)</p>
        <List items={["1080p a 120 o 240 fps con objetivo lineal (sin ojo de pez) y estabilización apagada o en modo mínimo. Ten cuidado con la tarjeta: a más fps, más ocupa."]} />
      </Section>

      <Section title="2 · Subir el vídeo y ajustarlo">
        <H>Subirlo sin perder fps</H>
        <List
          items={[
            <>
              <strong className="text-foreground">iPhone:</strong> en Fotos, Compartir › «Guardar en Archivos» (carpeta «En mi iPhone»). En Atlenza, «Elegir archivo» › «Explorar» y busca el vídeo en Archivos. Si lo eliges desde Fototeca, iOS puede convertirlo y quitarle fotogramas (un vídeo de 100 fps llega como uno de 25).
            </>,
            <>
              <strong className="text-foreground">Android:</strong> elige el archivo desde Archivos o la carpeta del dispositivo (DCIM/Camera), no una copia de la nube ni de Google Fotos, que puede estar comprimida.
            </>,
            <>
              <strong className="text-foreground">Ordenador:</strong> copia el original del móvil por cable (o AirDrop en Mac). Si tu navegador no lee el vídeo, suele ser el códec HEVC: abre Atlenza desde el móvil.
            </>,
            "Nunca lo envíes por WhatsApp, Telegram, correo ni mensajes: lo recomprimen y bajan los fps.",
          ]}
        />
        <H>Ajustarlo en Atlenza</H>
        <List
          items={[
            "Elige el tipo de salto y el vídeo. Espera a que muestre los fps del fichero.",
            "Comprueba que coinciden con los fps a los que grabaste. Si no, Atlenza te avisa de que el móvil lo ha convertido y calcula con los del fichero.",
            "Si el vídeo se ve a cámara lenta, marca «Sí» e indica 120 o 240 fps. La cámara lenta del iPhone solo ralentiza un tramo: amplíalo en Fotos › Editar para que cubra todo el salto. Si va a velocidad real, deja «No».",
            "Si no se pueden medir los fps del fichero, indícalos en «Fps del fichero» (están en la información del vídeo).",
            "Mueve el deslizador y afina con ±1. Despegue: primer fotograma sin contacto de ningún pie (el anterior aún toca con la punta). Aterrizaje: primer fotograma en que algún pie toca el suelo. La sombra en el suelo ayuda.",
            "Pulsa «Añadir intento» y repite con cada salto (hasta 10). Guarda: se registran el mejor y la media.",
          ]}
        />
      </Section>

      <Section title="3 · Cómo se calcula">
        <p>
          Se mide el <strong className="text-foreground">tiempo de vuelo</strong>: los fotogramas entre el despegue y el aterrizaje, divididos entre los fps efectivos (los del fichero, o los de grabación dentro del tramo de cámara lenta).
        </p>
        <List
          items={[
            <>
              Altura: <span className="text-foreground tabular-nums">h = g · t² / 8</span> (g = 9,81 m/s²). Si subes y bajas en el mismo tiempo, la subida dura t/2, la velocidad de despegue es v = g·t/2 y h = v²/(2g).
            </>,
            <>
              Ejemplo: t = {formatNum(EXAMPLE_S, 2)} s → {formatNum(jumpHeight(EXAMPLE_S) * 100, 1)} cm y {formatNum(takeoffVelocity(EXAMPLE_S), 2)} m/s de despegue.
            </>,
            "Salto desde cajón (DJ): se marca también el contacto. RSI = altura (m) / tiempo de contacto (s).",
            "El servidor recalcula la altura con los fotogramas antes de guardar. Se guardan el mejor intento y la media como dos tests, y en las notas los fps y los fotogramas.",
          ]}
        />
        <H>Qué dice la evidencia</H>
        <List
          items={[
            "La fórmula es mecánica de proyectiles. Medir el tiempo de vuelo con vídeo se validó frente a plataforma de fuerza (Balsalobre-Fernández et al., 2015; el estudio comparaba también el tiempo de vuelo).",
            "El método de impulso-momento en plataforma de fuerza es más preciso que el tiempo de vuelo (Linthorne, 2001). El vídeo, como la plataforma, supone que despegas y aterrizas con el cuerpo en la misma postura.",
            "Las alturas con una tabla de salto (tipo Vertec) salen más altas que con la plataforma de fuerza (un estudio encontró ~27 % más): miden cosas distintas y no son intercambiables.",
          ]}
        />
      </Section>

      <Section title="4 · Para medidas más precisas (y lo que quizá no te han dicho)">
        <List
          items={[
            "Mismo método para comparar: misma cámara, fps, calzado (o descalza), superficie y hora del día. Con 100 fps un fotograma son ±1,2 cm: diferencias menores de 1,5 cm entre sesiones son ruido.",
            "Haz 3–5 saltos con 30–60 s de descanso y calienta antes. La fatiga reduce la altura.",
            "Sin pasos previos ni apoyarte en nada. CMJ con las manos en la cintura (Abalakov con brazos). Misma profundidad de flexión cada vez.",
            "Mantén las piernas extendidas en el aire y cae en el mismo sitio con ellas extendidas: flexionar rodillas o cadera antes de tocar el suelo alarga el vuelo y exagera la altura.",
            "Descarta los intentos con aterrizaje raro, giro o paso. Si un intento sale muy por encima de los demás, revisa los fotogramas marcados.",
            "Si una altura te parece imposible (un CMJ normal ronda los 25–45 cm), revisa antes los fps del fichero y el aviso en rojo.",
            "No lo compares con la tabla: la tabla mide hasta dónde llega la mano (brazo, hombro, inclinación y el empuje previo al despegue), y da más altura. Con la misma persona la diferencia suele ser estable: si quieres tu diferencia, mide 5 saltos con ambos métodos y haz la media.",
            "Para seguir tu evolución, el tiempo de vuelo es mejor que la tabla porque no depende de cuánto te estires.",
            `Con 30 fps o menos el error es demasiado grande (± ${formatNum(frameErrorCm(30, 0.5), 1)} cm por fotograma): graba a 100 o más.`,
            "Tu privacidad: el vídeo no sale del navegador. Puedes borrarlo cuando termines; solo se guardan los resultados.",
          ]}
        />
      </Section>
    </section>
  );
}
