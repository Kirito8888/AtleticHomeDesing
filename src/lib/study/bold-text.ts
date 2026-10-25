/** Utilidades de texto con `**negrita**` compartidas por los formatos de estudio (resumen, esquema, informe). */

export const clean = (s: string) => s.replace(/\s+/g, " ").trim();
export const stars = (s: string) => (s.match(/\*\*/g) ?? []).length;

/** Quita la negrita si quedó sin cerrar (par impar de `**`). */
export function balanceBold(s: string): string {
  return stars(s) % 2 === 0 ? s : s.replace(/\*\*/g, "");
}

/** Corta por palabra con «…» solo cuando una frase suelta no cabe. */
export function clip(s: string, max: number): string {
  s = balanceBold(clean(s));
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return balanceBold(`${(sp > max * 0.5 ? cut.slice(0, sp) : cut).replace(/[\s,;:.]+$/, "")}…`);
}

/** Frases respetando la negrita: no corta dentro de `** … **`. */
export function sentences(s: string): string[] {
  const out: string[] = [];
  let cur = "";
  let bold = false;
  const t = clean(s);
  for (let i = 0; i < t.length; i++) {
    if (t.startsWith("**", i)) {
      bold = !bold;
      cur += "**";
      i++;
      continue;
    }
    cur += t[i];
    if (!bold && /[.!?]/.test(t[i]) && (i + 1 === t.length || t[i + 1] === " ")) {
      out.push(cur.trim());
      cur = "";
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}


export interface Seg {
  text: string;
  bold: boolean;
}

/** `**negrita**` → segmentos. No interpreta nada más (se pinta como texto, sin HTML). */
export function parseBold(s: string): Seg[] {
  const parts = balanceBold(s).split("**");
  return parts.map((t, i) => ({ text: t, bold: i % 2 === 1 })).filter((p) => p.text);
}

export const stripBold = (s: string) => s.replace(/\*\*/g, "");
