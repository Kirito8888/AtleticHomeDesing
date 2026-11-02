// Solo para pruebas (unitarias y E2E): arma un .pptx mínimo sin depender de PowerPoint.
import { strToU8, zipSync } from "fflate";

/** Arma un .pptx mínimo con estas diapositivas `{ text, notes }` (en este orden). */
export function buildPptxForTest(slides: { text: string[]; notes?: string }[]): Buffer {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const para = (t: string) => `<a:p><a:r><a:t>${esc(t)}</a:t></a:r></a:p>`;
  const files: Record<string, Uint8Array> = {};
  const rels: string[] = [];
  const ids: string[] = [];
  slides.forEach((s, i) => {
    const n = i + 1;
    files[`ppt/slides/slide${n}.xml`] = strToU8(`<p:sld><p:cSld><p:spTree><p:sp><p:txBody>${s.text.map(para).join("")}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`);
    if (s.notes) {
      files[`ppt/notesSlides/notesSlide${n}.xml`] = strToU8(`<p:notes><p:txBody>${para(s.notes)}</p:txBody></p:notes>`);
      files[`ppt/slides/_rels/slide${n}.xml.rels`] = strToU8(`<Relationships><Relationship Id="rId1" Type="x/notesSlide" Target="../notesSlides/notesSlide${n}.xml"/></Relationships>`);
    }
    rels.push(`<Relationship Id="rId${n}" Type="x/slide" Target="slides/slide${n}.xml"/>`);
    ids.push(`<p:sldId id="${255 + n}" r:id="rId${n}"/>`);
  });
  files["ppt/presentation.xml"] = strToU8(`<p:presentation><p:sldIdLst>${ids.join("")}</p:sldIdLst></p:presentation>`);
  files["ppt/_rels/presentation.xml.rels"] = strToU8(`<Relationships>${rels.join("")}</Relationships>`);
  return Buffer.from(zipSync(files));
}
