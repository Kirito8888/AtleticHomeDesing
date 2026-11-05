// Solo para pruebas (unitarias y de integración): arma un .docx mínimo sin depender de Word.
import { strToU8, zipSync } from "fflate";

export type DocxBlock = { h?: 1 | 2 | 3; text?: string; li?: string; row?: string[] };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const run = (t: string) => `<w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;

/** Arma un .docx mínimo con encabezados (Heading1-3), párrafos, elementos de lista y filas de tabla. */
export function buildDocxForTest(blocks: DocxBlock[]): Buffer {
  const body = blocks
    .map((b) => {
      if (b.h) return `<w:p><w:pPr><w:pStyle w:val="Heading${b.h}"/></w:pPr>${run(b.text ?? "")}</w:p>`;
      if (b.li) return `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${run(b.li)}</w:p>`;
      if (b.row) return `<w:tbl><w:tr>${b.row.map((c) => `<w:tc><w:p>${run(c)}</w:p></w:tc>`).join("")}</w:tr></w:tbl>`;
      return `<w:p>${run(b.text ?? "")}</w:p>`;
    })
    .join("");
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const style = (id: string, name: string) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/></w:style>`;
  return Buffer.from(
    zipSync({
      "[Content_Types].xml": strToU8(
        '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
      ),
      "_rels/.rels": strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
      "word/_rels/document.xml.rels": strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>'),
      "word/styles.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><w:styles ${W}>${style("Heading1", "heading 1")}${style("Heading2", "heading 2")}${style("Heading3", "heading 3")}${style("ListParagraph", "List Paragraph")}</w:styles>`),
      "word/numbering.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`),
      "word/document.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${body}</w:body></w:document>`),
    }),
  );
}
