/**
 * Prueba de integración contra el servidor de IA local (llama.cpp). Usa las variables reales del entorno:
 *   set -a; . ./.env.local; set +a
 *   npx tsx --conditions=react-server scripts/test-ia-local.ts
 * (`--conditions=react-server` hace que `import "server-only"` no falle fuera de Next.)
 * Si `/health` no responde lo dice y sale con código 0: el servidor local está apagado a veces, y es normal.
 * Sale con 1 solo si el servidor está encendido y alguna comprobación falla.
 */
import { localChat, localChatStream, localConfig, localHealthy, type LocalAiConfig } from "../src/lib/ai/local";

// 1×1 píxel rojo (PNG), para comprobar que el modelo acepta imágenes.
const PNG_RED = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

let failed = 0;
const report = (name: string, ok: boolean, detail: string) => {
  if (!ok) failed++;
  console.log(`${ok ? "OK  " : "FALLA"} ${name}: ${detail}`);
};
const rate = (tokens: number | undefined, ms: number) => (tokens && ms > 0 ? `${tokens} tokens, ${((tokens / ms) * 1000).toFixed(1)} tok/s` : "tokens n/d");

async function timed<T>(fn: () => Promise<T>): Promise<{ r: T; ms: number }> {
  const t0 = Date.now();
  const r = await fn();
  return { r, ms: Date.now() - t0 };
}

async function main() {
  const cfg = localConfig();
  if (!cfg) {
    console.log("LOCAL_AI_BASE_URL no está definido: nada que probar.");
    return;
  }
  console.log(`Proveedor: local · modelo ${cfg.model}`);

  const health = await timed(() => localHealthy(cfg));
  if (!health.r) {
    console.log(`El servidor local NO responde a /health (${health.ms} ms). Atlenza usaría Gemini. Se omiten las pruebas.`);
    return;
  }
  report("health", true, `${health.ms} ms`);

  // 401 sin clave: comprueba que el servidor exige autenticación.
  const noKey = await fetch(`${cfg.baseUrl}/models`, { signal: AbortSignal.timeout(5_000) }).catch(() => null);
  report("401 sin clave", noKey?.status === 401, `estado ${noKey?.status ?? "sin respuesta"}`);

  const short = await timed(() => localChat(cfg, { system: "Resume en una frase.", messages: [{ role: "user", text: "Las mitocondrias producen la mayor parte del ATP de la célula mediante la respiración aerobia." }], temperature: 0.2 }));
  report("resumen corto", short.r.text.trim().length > 0, `proveedor local · ${short.ms} ms · ${rate(short.r.outputTokens, short.ms)} · «${short.r.text.trim().slice(0, 80)}»`);

  const img = await timed(() => localChat(cfg, { system: "Responde en una palabra.", messages: [{ role: "user", text: "¿De qué color es esta imagen?", images: [{ mime: "image/png", base64: PNG_RED }] }], temperature: 0 }));
  report("imagen", img.r.text.trim().length > 0, `proveedor local · ${img.ms} ms · «${img.r.text.trim().slice(0, 60)}»`);

  let pieces = 0;
  let text = "";
  const t0 = Date.now();
  let firstMs = 0;
  const it = localChatStream(cfg as LocalAiConfig, { system: "Eres conciso.", messages: [{ role: "user", text: "Escribe tres frases sobre el sueño." }], temperature: 0.3 });
  for (;;) {
    const n = await it.next();
    if (n.done) break;
    if (!pieces) firstMs = Date.now() - t0;
    pieces++;
    text += n.value;
  }
  const total = Date.now() - t0;
  report("streaming", pieces > 1 && text.trim().length > 0, `${pieces} trozos · primer trozo a los ${firstMs} ms · total ${total} ms · ~${((text.length / 4 / total) * 1000).toFixed(1)} tok/s (estimado)`);

  console.log(failed ? `\n${failed} comprobación(es) fallida(s).` : "\nTodo correcto.");
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error("Error inesperado:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
