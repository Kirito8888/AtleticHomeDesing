import { z } from "zod";

export const mockExamSchema = z.object({ deckId: z.string().min(1).max(40), count: z.number().int().min(3).max(50).default(10) });
export const mockResultSchema = z.object({ deckId: z.string().min(1).max(40), failed: z.array(z.string().min(1).max(40)).max(50) });

/** n elementos al azar sin repetir (Fisher–Yates parcial). `rand` se inyecta en los tests. */
export function pickRandom<T>(items: readonly T[], n: number, rand: () => number = Math.random): T[] {
  const a = [...items];
  const k = Math.min(n, a.length);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rand() * (a.length - i));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, k);
}

/** Nota sobre 10 con un decimal y si se considera aprobado (≥ 5). */
export function examScore(right: number, total: number) {
  const score = total ? Math.round((right / total) * 100) / 10 : 0;
  return { score, passed: score >= 5 };
}
