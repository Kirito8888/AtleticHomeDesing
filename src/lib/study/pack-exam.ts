// Composición de jefes y examen final a partir de las preguntas guardadas de los temas (pura, azar inyectado).
import { activeKinds, allocate, type ExamFormat, type Kind } from "./exam-format";
import type { QuestItem } from "./quest-mock";

/** Tipo de una pregunta del paquete según su id `pk:<nodo>:<tt|te|pc|pt|pe>:<hash>`; null si no es del paquete. */
export function kindOf(id: string): Kind | null {
  const m = /^pk:[^:]+:(tt|te|pc|pt|pe):/.exec(id);
  if (!m) return null;
  return ({ tt: "theoryTest", te: "theoryEssay", pc: "practiceCmd", pt: "practiceTest", pe: "practiceEssay" } as const)[m[1] as "tt"];
}

function shuffled<T>(a: readonly T[], rng: () => number): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

/**
 * Elige `total` preguntas repartidas por tipo según los pesos del formato. Si de un tipo hay menos de las que tocan, el hueco
 * se rellena con las demás (nunca se repite una pregunta). Sin preguntas suficientes devuelve las que haya.
 */
export function composeExam(items: QuestItem[], format: ExamFormat, total: number, rng: () => number = Math.random): QuestItem[] {
  const want = allocate(format, total);
  const pool = new Map<Kind, QuestItem[]>();
  for (const it of items) {
    const k = kindOf(it.id);
    if (k) pool.set(k, [...(pool.get(k) ?? []), it]);
  }
  const picked: QuestItem[] = [];
  const used = new Set<string>();
  const take = (k: Kind, n: number) => {
    for (const it of shuffled(pool.get(k) ?? [], rng)) {
      if (n <= 0) break;
      if (used.has(it.id)) continue;
      used.add(it.id);
      picked.push(it);
      n--;
    }
    return n;
  };
  let missing = 0;
  for (const k of activeKinds(format)) missing += take(k, want[k] ?? 0);
  // Hueco: primero de los tipos activos, luego de cualquiera.
  for (const k of [...activeKinds(format), ...(pool.keys() as Iterable<Kind>)]) {
    if (missing <= 0) break;
    missing = take(k, missing);
  }
  return shuffled(picked, rng);
}
