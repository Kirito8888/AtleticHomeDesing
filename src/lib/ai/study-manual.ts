import "server-only";

import { MAX_SOURCE_CHARS } from "@/lib/ai/flashcards";
import { assertAiAllowed } from "@/lib/ai/guard";
import { generateJson } from "@/lib/ai/llm";
import { loadSource } from "@/lib/ai/study-adapt";
import { buildManualPdf } from "@/lib/study/pdf-render";
import { buildManualPrompt, fakeManual, type Manual, manualAiSchema, type ManualRequest, normalizeManual } from "@/lib/study/practical-manual";

const fakeAi = () => process.env.LIFEOS_FAKE_AI === "1";

/** Genera el manual (JSON de la IA → maqueta propia). No escribe nada. */
export async function generateManual(userId: string, req: ManualRequest): Promise<Manual> {
  const src = await loadSource(userId, req.source);
  const sources = src.text.slice(0, MAX_SOURCE_CHARS);
  if (fakeAi()) return normalizeManual(fakeManual(sources));
  await assertAiAllowed(userId);
  const p = buildManualPrompt({ label: src.label, sources });
  const r = await generateJson(manualAiSchema, { userId, system: p.system, prompt: p.prompt, temperature: 0.2 });
  return normalizeManual(r.data);
}

export async function generateManualPdf(userId: string, req: ManualRequest): Promise<{ pdf: Uint8Array; title: string }> {
  const m = await generateManual(userId, req);
  return { pdf: await buildManualPdf(m), title: m.title };
}
