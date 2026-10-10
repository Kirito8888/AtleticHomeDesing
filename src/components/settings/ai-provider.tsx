"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/client-api";

type Provider = "GEMINI" | "OPENAI" | "ANTHROPIC";

export type AiProviderView = {
  own: { provider: Provider; baseUrl: string | null; model: string; embeddingModel: string | null; keyHint: string | null; verifiedAt: string | null; label: string } | null;
  serverFallback: { label: string; model: string } | null;
};

const PROVIDER_LABEL: Record<Provider, string> = { GEMINI: "Google Gemini", OPENAI: "OpenAI o compatible (Mistral, Groq, OpenRouter, local…)", ANTHROPIC: "Anthropic (Claude)" };
const KEY_HELP: Record<Provider, string> = {
  GEMINI: "Créala gratis en Google AI Studio (aistudio.google.com → Get API key).",
  OPENAI: "La de tu cuenta del servicio elegido. Un modelo local de este servidor no la necesita.",
  ANTHROPIC: "Créala en console.anthropic.com → API keys.",
};
const OTHER = "__otra__";

/** v1.9 · Cada persona usa su propia IA: proveedor, modelo y clave (cifrada; nunca se vuelve a mostrar). */
export function AiProviderSettings({
  view,
  presets,
  locals,
  defaults,
}: {
  view: AiProviderView;
  presets: Array<{ label: string; baseUrl: string }>;
  locals: string[];
  defaults: Record<Provider, { model: string; embeddingModel: string | null }>;
}) {
  const router = useRouter();
  const own = view.own;
  const [provider, setProvider] = useState<Provider>(own?.provider ?? "GEMINI");
  const knownUrls = [...presets.map((p) => p.baseUrl), ...locals];
  const initialUrl = own?.baseUrl ?? presets[0]?.baseUrl ?? "";
  const [service, setService] = useState(knownUrls.includes(initialUrl) ? initialUrl : OTHER);
  const [customUrl, setCustomUrl] = useState(knownUrls.includes(initialUrl) ? "" : initialUrl);
  const [model, setModel] = useState(own?.model ?? defaults.GEMINI.model);
  const [embeddingModel, setEmbeddingModel] = useState(own?.embeddingModel ?? defaults.GEMINI.embeddingModel ?? "");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);

  const baseUrl = provider === "OPENAI" ? (service === OTHER ? customUrl.trim() : service) : null;
  const keepsKey = Boolean(own && own.provider === provider && (own.baseUrl ?? null) === baseUrl && own.keyHint);

  function pickProvider(p: Provider) {
    setProvider(p);
    setModel(own?.provider === p ? own.model : defaults[p].model);
    setEmbeddingModel(own?.provider === p ? (own.embeddingModel ?? "") : (defaults[p].embeddingModel ?? ""));
  }
  function pickService(url: string) {
    setService(url);
    // Un modelo local no suele tener los nombres de OpenAI
    if (locals.includes(url) && model === defaults.OPENAI.model) {
      setModel("llama3.1");
      setEmbeddingModel("nomic-embed-text");
    }
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 text-sm">
      <p role="status" aria-label="IA en uso" className="rounded-md border p-2">
        {own ? (
          <>
            <strong>Tu IA:</strong> {own.label} · {own.model}
            {own.embeddingModel ? ` · apuntes con ${own.embeddingModel}` : " · apuntes buscados por texto"}
            {own.keyHint ? ` · clave …${own.keyHint}` : " · sin clave"}
            {own.verifiedAt ? ` · probada el ${new Date(own.verifiedAt).toLocaleDateString("es-ES")}` : ""}
          </>
        ) : view.serverFallback ? (
          <>
            <strong>Usas la IA del servidor:</strong> {view.serverFallback.label} · {view.serverFallback.model}. Puedes poner la tuya.
          </>
        ) : (
          <>
            <strong>Sin IA configurada.</strong> Pon tu propia clave para usar el tutor de apuntes, el coach semanal y los planes con IA.
          </>
        )}
      </p>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const r = await api<{ label: string; consentReset: boolean; reindexing: number }>("/api/account/ai-provider", {
              method: "PUT",
              body: { provider, baseUrl, model: model.trim(), embeddingModel: provider === "ANTHROPIC" ? null : embeddingModel.trim() || null, apiKey: apiKey.trim() || null },
            });
            setApiKey("");
            toast.success(`Conexión correcta con ${r.label}. Guardado.`);
            if (r.consentReset) toast.info("Has cambiado de proveedor: vuelve a activar el permiso de IA de abajo.");
            if (r.reindexing) toast.info(`Reindexando ${r.reindexing} ${r.reindexing === 1 ? "documento" : "documentos"} de apuntes con el nuevo modelo.`);
            router.refresh();
          });
        }}
      >
        <Field label="Proveedor" htmlFor="ai-provider">
          <Select id="ai-provider" value={provider} onChange={(e) => pickProvider(e.target.value as Provider)}>
            {(Object.keys(PROVIDER_LABEL) as Provider[]).map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABEL[p]}
              </option>
            ))}
          </Select>
        </Field>
        {provider === "OPENAI" ? (
          <Field label="Servicio" htmlFor="ai-service">
            <Select id="ai-service" value={service} onChange={(e) => pickService(e.target.value)}>
              {presets.map((p) => (
                <option key={p.baseUrl} value={p.baseUrl}>
                  {p.label}
                </option>
              ))}
              {locals.map((u) => (
                <option key={u} value={u}>
                  Modelo local de este servidor ({u})
                </option>
              ))}
              <option value={OTHER}>Otra URL (https)</option>
            </Select>
          </Field>
        ) : null}
        {provider === "OPENAI" && service === OTHER ? (
          <Field label="URL de la API" htmlFor="ai-url" hint="Compatible con OpenAI, termina normalmente en /v1. Las redes internas solo las autoriza la administración.">
            <Input id="ai-url" type="url" inputMode="url" required value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder="https://…/v1" />
          </Field>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Modelo" htmlFor="ai-model">
            <Input id="ai-model" required value={model} onChange={(e) => setModel(e.target.value)} autoComplete="off" spellCheck={false} />
          </Field>
          {provider !== "ANTHROPIC" ? (
            <Field label="Modelo de embeddings (apuntes)" htmlFor="ai-embed" hint="De 768 dimensiones. Vacío = buscar en los apuntes por texto.">
              <Input id="ai-embed" value={embeddingModel} onChange={(e) => setEmbeddingModel(e.target.value)} autoComplete="off" spellCheck={false} />
            </Field>
          ) : (
            <p className="self-end text-xs text-muted-foreground">Anthropic no tiene embeddings: tus apuntes se buscarán por texto.</p>
          )}
        </div>
        <Field label="Clave de API" htmlFor="ai-key" hint={keepsKey ? `Vacía = conservar la guardada (…${own?.keyHint}). ${KEY_HELP[provider]}` : KEY_HELP[provider]}>
          <Input id="ai-key" type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        </Field>
        <p className="text-xs text-muted-foreground">
          La clave se guarda cifrada en este servidor y no se vuelve a mostrar ni se exporta. Antes de guardar se prueba con un mensaje corto que no lleva datos tuyos. Los datos de salud nunca se envían a la IA.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}>
            Guardar y probar
          </Button>
          {own ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const r = await api<{ ms: number; label: string; embeddings: boolean }>("/api/account/ai-provider/test", { method: "POST" });
                    toast.success(`${r.label} responde (${(r.ms / 1000).toFixed(1)} s)${r.embeddings ? " · embeddings correctos" : ""}`);
                    router.refresh();
                  })
                }
              >
                Probar conexión
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  confirm("¿Quitar tu IA? Se borra la clave guardada.") &&
                  run(async () => {
                    await api("/api/account/ai-provider", { method: "DELETE" });
                    toast.success("Tu IA se ha quitado");
                    router.refresh();
                  })
                }
              >
                Quitar mi IA
              </Button>
            </>
          ) : null}
        </div>
      </form>
    </div>
  );
}
