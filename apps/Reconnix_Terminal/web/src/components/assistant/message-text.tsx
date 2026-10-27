/* A model reply as React elements, from the blocks lib/assistant/markdown.ts finds:
   paragraphs, headings, bullet and numbered lists, quotes, tables (they scroll sideways), code
   blocks (language label and Copy), **bold**, *italic* and `code`. Everything else stays plain
   text: the reply is never parsed as HTML (no dangerouslySetInnerHTML), and Markdown links stay
   text, so nothing in it can run or link anywhere. */
import { Fragment } from "react";

import { parseBlocks } from "@/lib/assistant/markdown";
import { CodeBlock } from "./code-block";

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|(?<![*\w])\*(?![\s*])[^*\n]+?(?<![\s*])\*(?![*\w]))/g;

function Inline({ text }: { text: string }) {
  const parts = text.split(INLINE);
  return (
    <>
      {parts.map((part, i) => {
        if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
        if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
        if (part.length > 2 && part.startsWith("*") && part.endsWith("*")) return <em key={i}>{part.slice(1, -1)}</em>;
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

export function MessageText({ text }: { text: string }) {
  return (
    <div className="ai-prose">
      {parseBlocks(text).map((b, i) => {
        switch (b.kind) {
          case "code":
            return <CodeBlock key={i} lang={b.lang} code={b.text} />;
          case "table":
            return (
              <div key={i} className="ai-table-wrap" tabIndex={0} role="region" aria-label="Table">
                <table className="ai-table">
                  <thead>
                    <tr>
                      {b.head.map((h, c) => (
                        <th key={c} scope="col" data-align={b.align[c] ?? undefined}>
                          <Inline text={h} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, r) => (
                      <tr key={r}>
                        {row.map((cell, c) => (
                          <td key={c} data-align={b.align[c] ?? undefined}>
                            <Inline text={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "ul":
          case "ol": {
            const List = b.kind;
            return (
              <List key={i}>
                {b.items.map((item, j) => (
                  <li key={j}>
                    <Inline text={item} />
                  </li>
                ))}
              </List>
            );
          }
          case "h": {
            const Heading = b.level === 3 ? "h3" : "h4";
            return (
              <Heading key={i}>
                <Inline text={b.text} />
              </Heading>
            );
          }
          case "quote":
            return (
              <blockquote key={i}>
                <Inline text={b.text} />
              </blockquote>
            );
          case "hr":
            return <hr key={i} />;
          default:
            return (
              <p key={i}>
                <Inline text={b.text} />
              </p>
            );
        }
      })}
    </div>
  );
}
