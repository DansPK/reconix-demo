/* A Word document (.docx, Office Open XML) from a small block model: the report builders
   (report.ts, combined.ts) say what the document holds, this file writes the parts and zips them.

   Every value is XML-escaped and stripped of the characters XML 1.0 can't hold (control
   characters, lone surrogates), so tool output or an operator's text reads as text and can never
   break the document. The package has no external relationships, macros or embedded objects:
   the document, its styles and its core properties only.

   Its size is bounded: a value's lines share one run (a <w:br/> between them, runs of blank lines
   kept as one), and document.xml may hold at most DOCX_MAX_BYTES; past that docxFile throws
   DocxTooLarge, which the routes answer with 413 (DOCX_TOO_LARGE). */
import { DOCX_MAX_MIB } from "../formats";
import { zipStore } from "./zip";

/** A piece of text in a paragraph; a newline in it is a line break. */
export type Run = string | { text: string; bold?: boolean; mono?: boolean; muted?: boolean };

export type Block =
  | { kind: "title"; text: string }
  | { kind: "subtitle"; text: string }
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "para"; runs: Run[]; note?: boolean }
  | { kind: "bullets"; items: Run[][] }
  | { kind: "kv"; rows: [string, string][] }
  /** `weights`: each column's share of the width (equal shares without). */
  | { kind: "table"; head: string[]; rows: string[][]; empty?: string; weights?: number[] }
  | { kind: "pre"; lines: string[] }
  | { kind: "pagebreak" };

export interface DocMeta {
  title: string;
  /** ISO time the report was generated (the core properties' created date). */
  created: string;
}

// --- text ----------------------------------------------------------------------------------
// XML 1.0 allows tab, newline, carriage return and U+0020 upward (minus surrogates, FFFE, FFFF)
const INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** Text as XML character data: invalid characters dropped, the five specials escaped. */
export function xmlText(value: unknown): string {
  return String(value ?? "")
    .replace(INVALID, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** The text's lines, with every run of blank lines kept as one blank line. */
function lines(text: string): string[] {
  const out: string[] = [];
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (!line.trim() && out.length && !out[out.length - 1].trim()) continue;
    out.push(line);
  }
  return out;
}

/** A <w:t> for one piece of a line (none for an empty one), keeping its spaces where Word would
    otherwise drop them (leading, trailing or doubled). */
function textElement(piece: string): string {
  const clean = piece.replace(INVALID, "");
  if (!clean) return "";
  return `<w:t${/^\s|\s$|\s\s/.test(clean) ? ' xml:space="preserve"' : ""}>${xmlText(clean)}</w:t>`;
}

/** One run for the whole value: its properties once, a <w:br/> between lines, a <w:tab/> per tab. */
function run(r: Run): string {
  const o = typeof r === "string" ? { text: r } : r;
  const props =
    (o.bold ? "<w:b/>" : "") +
    (o.mono ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="18"/>' : "") +
    (o.muted ? '<w:color w:val="5B6770"/>' : "");
  const body = lines(String(o.text ?? ""))
    .map((line, i) => {
      const cells = line.split("\t").map(textElement);
      return `${i ? "<w:br/>" : ""}${cells.join("<w:tab/>")}`;
    })
    .join("");
  return body ? `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}${body}</w:r>` : "";
}

const para = (runs: Run[], style?: string) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}${runs.map(run).join("")}</w:p>`;

// --- tables --------------------------------------------------------------------------------
const PAGE_W = 11906; // A4, twips
const MARGIN = 1134; // 2 cm
const TEXT_W = PAGE_W - 2 * MARGIN;

function table(head: string[] | null, rows: string[][], weights?: number[]): string {
  const cols = Math.max(head?.length ?? 0, ...rows.map((r) => r.length), 1);
  const shares = weights && weights.length === cols && weights.every((x) => x > 0) ? weights : Array.from({ length: cols }, () => 1);
  const sum = shares.reduce((n, x) => n + x, 0);
  const w = shares.map((x) => Math.floor((TEXT_W * x) / sum));
  const grid = `<w:tblGrid>${w.map((x) => `<w:gridCol w:w="${x}"/>`).join("")}</w:tblGrid>`;
  const cell = (text: string, i: number, header: boolean) =>
    `<w:tc><w:tcPr><w:tcW w:w="${w[i]}" w:type="dxa"/>${header ? '<w:shd w:val="clear" w:color="auto" w:fill="E8EEF0"/>' : ""}</w:tcPr>` +
    `${para([header ? { text, bold: true } : text], "TableText")}</w:tc>`;
  const row = (cells: string[], header: boolean) =>
    `<w:tr>${header ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${Array.from({ length: cols }, (_, i) => cell(cells[i] ?? "", i, header)).join("")}</w:tr>`;
  return (
    `<w:tbl><w:tblPr><w:tblStyle w:val="ReportTable"/><w:tblW w:w="${TEXT_W}" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr>${grid}` +
    `${head ? row(head, true) : ""}${rows.map((r) => row(r, false)).join("")}</w:tbl>` +
    para([], "TableGap")
  );
}

function block(b: Block): string {
  switch (b.kind) {
    case "title":
      return para([b.text], "Title");
    case "subtitle":
      return para([b.text], "Subtitle");
    case "heading":
      return para([b.text], `Heading${b.level}`);
    case "para":
      return para(b.runs, b.note ? "Note" : undefined);
    case "bullets":
      return b.items.map((runs) => para(["•\t", ...runs], "Bullet")).join("");
    case "kv":
      return table(null, b.rows, [3, 7]);
    case "table":
      return b.rows.length ? table(b.head, b.rows, b.weights) : para([b.empty ?? "None."], "Note");
    case "pre":
      return para([{ text: b.lines.join("\n") || "—", mono: true }], "Evidence");
    case "pagebreak":
      return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  }
}

// --- the parts ----------------------------------------------------------------------------
const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** The most document.xml may hold, in bytes (DOCX_MAX_MIB, the one number the message names). */
export const DOCX_MAX_BYTES = DOCX_MAX_MIB * 1024 * 1024;

/** The document would pass DOCX_MAX_BYTES: the routes answer 413 with DOCX_TOO_LARGE. */
export class DocxTooLarge extends Error {
  constructor() {
    super(`The Word document would pass ${DOCX_MAX_MIB} MB.`);
    this.name = "DocxTooLarge";
  }
}

/** document.xml's bytes; stops as soon as the text passes `limit` (a UTF-16 length is never more
    than its UTF-8 byte count, so the running count is a lower bound, and the bytes are checked). */
function documentXml(blocks: Block[], limit: number): Uint8Array {
  const sect =
    `<w:sectPr><w:pgSz w:w="${PAGE_W}" w:h="16838"/>` +
    `<w:pgMar w:top="${MARGIN}" w:right="${MARGIN}" w:bottom="${MARGIN}" w:left="${MARGIN}" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>`;
  const parts = [`${HEAD}<w:document ${W_NS}><w:body>`];
  let size = parts[0].length;
  for (const b of blocks) {
    const xml = block(b);
    size += xml.length;
    if (size > limit) throw new DocxTooLarge();
    parts.push(xml);
  }
  parts.push(`${sect}</w:body></w:document>`);
  const bytes = new TextEncoder().encode(parts.join(""));
  if (bytes.length > limit) throw new DocxTooLarge();
  return bytes;
}

const pStyle = (id: string, name: string, ppr: string, rpr: string, based = "Normal") =>
  `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="${based}"/><w:qFormat/>` +
  `<w:pPr>${ppr}</w:pPr><w:rPr>${rpr}</w:rPr></w:style>`;

const STYLES =
  `${HEAD}<w:styles ${W_NS}>` +
  `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/>` +
  `<w:sz w:val="21"/><w:szCs w:val="21"/><w:color w:val="1F2A30"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault>` +
  `<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
  `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
  pStyle("Title", "Title", '<w:spacing w:after="60"/>', '<w:b/><w:sz w:val="44"/><w:color w:val="0B3B47"/>') +
  pStyle("Subtitle", "Subtitle", '<w:spacing w:after="240"/>', '<w:sz w:val="24"/><w:color w:val="5B6770"/>') +
  pStyle("Heading1", "heading 1", '<w:keepNext/><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="0"/>', '<w:b/><w:sz w:val="30"/><w:color w:val="0B3B47"/>') +
  pStyle("Heading2", "heading 2", '<w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="1"/>', '<w:b/><w:sz w:val="25"/><w:color w:val="0B3B47"/>') +
  pStyle("Heading3", "heading 3", '<w:keepNext/><w:spacing w:before="160" w:after="60"/><w:outlineLvl w:val="2"/>', '<w:b/><w:sz w:val="22"/>') +
  pStyle("Note", "Note", "", '<w:i/><w:sz w:val="19"/><w:color w:val="5B6770"/>') +
  pStyle("Bullet", "Bullet", '<w:tabs><w:tab w:val="left" w:pos="360"/></w:tabs><w:spacing w:after="40"/><w:ind w:left="360" w:hanging="360"/>', "") +
  pStyle("Evidence", "Evidence", '<w:shd w:val="clear" w:color="auto" w:fill="F1F4F5"/><w:spacing w:after="160" w:line="240" w:lineRule="auto"/><w:ind w:left="120" w:right="120"/>', '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="17"/>') +
  pStyle("TableText", "Table Text", '<w:spacing w:before="20" w:after="20" w:line="240" w:lineRule="auto"/>', '<w:sz w:val="18"/>') +
  pStyle("TableGap", "Table Gap", '<w:spacing w:after="120" w:line="120" w:lineRule="exact"/>', '<w:sz w:val="4"/>') +
  `<w:style w:type="table" w:styleId="ReportTable"><w:name w:val="Report Table"/><w:tblPr><w:tblBorders>` +
  ["top", "left", "bottom", "right", "insideH", "insideV"].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="C9D3D7"/>`).join("") +
  `</w:tblBorders><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>` +
  `</w:styles>`;

const CONTENT_TYPES =
  `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
  `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
  `</Types>`;

const ROOT_RELS =
  `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
  `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
  `</Relationships>`;

const DOC_RELS =
  `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
  `</Relationships>`;

function coreXml(meta: DocMeta): string {
  const when = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(meta.created) ? `${meta.created.slice(0, 19)}Z` : "1980-01-01T00:00:00Z";
  return (
    `${HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
    `xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<dc:title>${xmlText(meta.title)}</dc:title><dc:creator>Reconix</dc:creator>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${when}</dcterms:created></cp:coreProperties>`
  );
}

/** The .docx file's bytes for `blocks`; throws DocxTooLarge past `limit` bytes of document.xml. */
export function docxFile(blocks: Block[], meta: DocMeta, limit: number = DOCX_MAX_BYTES): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  return zipStore([
    { name: "[Content_Types].xml", data: enc.encode(CONTENT_TYPES) },
    { name: "_rels/.rels", data: enc.encode(ROOT_RELS) },
    { name: "docProps/core.xml", data: enc.encode(coreXml(meta)) },
    { name: "word/_rels/document.xml.rels", data: enc.encode(DOC_RELS) },
    { name: "word/styles.xml", data: enc.encode(STYLES) },
    { name: "word/document.xml", data: documentXml(blocks, limit) },
  ]);
}
