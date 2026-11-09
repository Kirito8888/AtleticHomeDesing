// v2.8 · N2 · Tarjetas a partir de «Resumir» y del paquete de tema. Puro y determinista: sin IA, sin BD.
// No inventa nada: solo reparte en anverso/reverso lo que ya está escrito (negritas, «término: definición», preguntas del paquete).
import type { AdaptDoc, OutlineNode } from "@/lib/study/adhd-format";
import { clean, parseBold, sentences, stripBold } from "@/lib/study/bold-text";
import { kindOf } from "@/lib/study/pack-exam";
import type { QuestItem } from "@/lib/study/quest-mock";

export interface CardDraft {
  front: string;
  back: string;
}

export const CARD_LIMITS = { front: 500, back: 1000, cards: 200, term: 80 } as const;

/** Clave para detectar duplicados: misma pregunta aunque cambien mayúsculas, espacios, negritas o signos de cierre. */
export function frontKey(s: string): string {
  return clean(stripBold(s).normalize("NFC").toLowerCase())
    .replace(/^[¿¡\s]+/, "")
    .replace(/[\s?!.:;]+$/, "");
}

/** Separa las tarjetas nuevas de las que ya están en el mazo (o repetidas dentro del propio lote). */
export function dedupeCards(cards: CardDraft[], existingFronts: Iterable<string>): { fresh: CardDraft[]; duplicates: number } {
  const seen = new Set(Array.from(existingFronts, frontKey));
  const fresh: CardDraft[] = [];
  let duplicates = 0;
  for (const c of cards) {
    const k = frontKey(c.front);
    if (!k || seen.has(k)) {
      duplicates++;
      continue;
    }
    seen.add(k);
    fresh.push(c);
  }
  return { fresh, duplicates };
}

const plain = (s: string) => clean(stripBold(s));

function card(front: string, back: string): CardDraft | null {
  const f = plain(front).slice(0, CARD_LIMITS.front);
  const b = back.trim().slice(0, CARD_LIMITS.back);
  if (f.length < 2 || !b || frontKey(f) === frontKey(b)) return null;
  return { front: f, back: b };
}

/** «**término**: definición» (también «—», «–», «=» o «-» con espacios). */
const TERM_DEF = /^\s*\*\*([^*]{2,80})\*\*\s*(?::|=|\s[—–-]\s)\s*(.+)$/;

/** Una línea con conceptos destacados → tarjetas: término/definición si la forma es clara; si no, cada negrita con su frase. */
function fromLine(line: string): CardDraft[] {
  const m = TERM_DEF.exec(line);
  if (m) {
    const c = card(m[1], plain(m[2]));
    return c ? [c] : [];
  }
  const out: CardDraft[] = [];
  for (const sent of sentences(line)) {
    for (const seg of parseBold(sent)) {
      if (!seg.bold) continue;
      const term = clean(seg.text);
      if (term.length < 2 || term.length > CARD_LIMITS.term) continue;
      const c = card(term, plain(sent));
      if (c) out.push(c);
    }
  }
  return out;
}

function fromOutline(node: OutlineNode, depth: number, out: CardDraft[]) {
  const kids = node.children ?? [];
  if (node.detail?.trim()) {
    const c = card(node.label, plain(node.detail));
    if (c) out.push(c);
  } else if (TERM_DEF.test(node.label)) {
    out.push(...fromLine(node.label));
  } else if (depth > 0 && kids.length) {
    const c = card(node.label, kids.map((k) => `• ${plain(k.label)}`).join("\n"));
    if (c) out.push(c);
  }
  kids.forEach((k) => fromOutline(k, depth + 1, out));
}

/** Tarjetas de un resultado de «Resumir» (resumen, esquema o informe). Máx. 200, sin repetidas dentro del lote. */
export function cardsFromAdapt(content: AdaptDoc): CardDraft[] {
  const out: CardDraft[] = [];
  if (content.mode === "summary") {
    const d = content.doc;
    [...d.sections.flatMap((s) => s.blocks), ...d.remember].forEach((l) => out.push(...fromLine(l)));
  } else if (content.mode === "outline") {
    fromOutline(content.doc.root, 0, out);
  } else {
    const d = content.doc;
    d.topics.forEach((t) => t.concepts.forEach((l) => out.push(...fromLine(l))));
    d.cheatSheet.forEach((g) => g.terms.forEach((l) => out.push(...fromLine(l))));
    for (const s of d.selfTest) {
      if (s.recall.length && s.recall.length === s.solutions.length) {
        s.recall.forEach((q, i) => {
          const c = card(q, plain(s.solutions[i]));
          if (c) out.push(c);
        });
      }
    }
  }
  return dedupeCards(out, []).fresh.slice(0, CARD_LIMITS.cards);
}

/** Tarjetas del paquete: solo las preguntas de test teórico (`pk:<tema>:tt:…`). Reverso = correcta + explicación. */
export function cardsFromPack(items: QuestItem[]): CardDraft[] {
  const out: CardDraft[] = [];
  for (const it of items) {
    if (kindOf(it.id) !== "theoryTest" || !it.t) continue;
    const [q, opts, exp] = it.t;
    const answer = clean(opts[0] ?? "");
    if (!answer) continue;
    const c = card(q, exp?.trim() ? `${answer}\n\n${clean(exp)}` : answer);
    if (c) out.push(c);
  }
  return dedupeCards(out, []).fresh.slice(0, CARD_LIMITS.cards);
}
