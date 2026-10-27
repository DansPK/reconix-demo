/* A strict XML 1.0 well-formedness check for the tests (no dependency): one root element, every
   tag closed in order, attributes quoted and not repeated, `&` only as a known or numeric entity,
   no `<` in text or attribute values, no `]]>` in text, and only the characters XML allows. It
   accepts the declaration, comments, CDATA and processing instructions where XML does, and does
   not resolve namespaces or check a schema: it says whether a parser would read the part at all. */

const NAME = /^[A-Za-z_][\w.:-]*/;
const CHARS = /^[\t\n\r -퟿-�\u{10000}-\u{10FFFF}]*$/u;
const ENTITY = /&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/y;

function checkText(text: string, where: string): void {
  for (let i = text.indexOf("&"); i !== -1; i = text.indexOf("&", i + 1)) {
    ENTITY.lastIndex = i;
    if (!ENTITY.test(text)) throw new Error(`${where}: a bare & at ${i}`);
  }
}

/** Throws with the reason when `xml` is not well-formed. */
export function assertWellFormed(xml: string): void {
  if (!CHARS.test(xml)) throw new Error("a character XML does not allow");
  let at = 0;
  if (xml.startsWith("<?xml")) {
    const end = xml.indexOf("?>");
    if (end === -1) throw new Error("an unclosed declaration");
    at = end + 2;
  }
  const open: string[] = [];
  let roots = 0;
  while (at < xml.length) {
    const lt = xml.indexOf("<", at);
    const text = xml.slice(at, lt === -1 ? xml.length : lt);
    if (text) {
      if (!open.length && text.trim()) throw new Error(`text outside the root at ${at}`);
      if (text.includes("]]>")) throw new Error(`]]> in text at ${at}`);
      checkText(text, `text at ${at}`);
    }
    if (lt === -1) break;
    at = lt;
    if (xml.startsWith("<!--", at)) {
      const end = xml.indexOf("-->", at + 4);
      if (end === -1 || xml.slice(at + 4, end).includes("--")) throw new Error(`a bad comment at ${at}`);
      at = end + 3;
    } else if (xml.startsWith("<![CDATA[", at)) {
      if (!open.length) throw new Error(`CDATA outside the root at ${at}`);
      const end = xml.indexOf("]]>", at);
      if (end === -1) throw new Error(`an unclosed CDATA at ${at}`);
      at = end + 3;
    } else if (xml.startsWith("<?", at)) {
      const end = xml.indexOf("?>", at);
      if (end === -1) throw new Error(`an unclosed instruction at ${at}`);
      at = end + 2;
    } else if (xml.startsWith("</", at)) {
      const name = NAME.exec(xml.slice(at + 2))?.[0];
      const end = xml.indexOf(">", at);
      if (!name || end === -1 || xml.slice(at + 2 + name.length, end).trim()) throw new Error(`a bad end tag at ${at}`);
      if (open.pop() !== name) throw new Error(`</${name}> closes the wrong element at ${at}`);
      at = end + 1;
    } else {
      const name = NAME.exec(xml.slice(at + 1))?.[0];
      if (!name) throw new Error(`a bad tag at ${at}`);
      at += 1 + name.length;
      const seen = new Set<string>();
      for (;;) {
        const space = /^\s*/.exec(xml.slice(at))![0];
        at += space.length;
        if (xml.startsWith("/>", at) || xml.startsWith(">", at)) break;
        const attr = NAME.exec(xml.slice(at))?.[0];
        if (!attr || !space) throw new Error(`a bad attribute in <${name}> at ${at}`);
        if (seen.has(attr)) throw new Error(`${attr} twice in <${name}>`);
        seen.add(attr);
        at += attr.length;
        const eq = /^\s*=\s*(["'])/.exec(xml.slice(at));
        if (!eq) throw new Error(`${attr} has no quoted value in <${name}>`);
        at += eq[0].length;
        const close = xml.indexOf(eq[1], at);
        if (close === -1) throw new Error(`${attr} is not closed in <${name}>`);
        const value = xml.slice(at, close);
        if (value.includes("<")) throw new Error(`< in ${attr} of <${name}>`);
        checkText(value, `${attr} of <${name}>`);
        at = close + 1;
      }
      if (!open.length) roots += 1;
      if (xml.startsWith("/>", at)) at += 2;
      else {
        open.push(name);
        at += 1;
      }
    }
  }
  if (open.length) throw new Error(`<${open[open.length - 1]}> is never closed`);
  if (roots !== 1) throw new Error(`${roots} root elements`);
}
