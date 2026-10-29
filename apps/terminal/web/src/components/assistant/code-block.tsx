/* A code block in a reply: its language as a label, Copy, and the code itself, which scrolls
   sideways inside the message instead of widening it. Plain text: nothing is highlighted or
   run. */
import { CopyButton } from "@/components/ui/copy-button";

export function CodeBlock({ lang, code }: { lang: string; code: string }) {
  return (
    <figure className="ai-code">
      <figcaption className="ai-code-head">
        <span>{lang || "text"}</span>
        <CopyButton text={code} label={`Copy the ${lang || "text"} code`} />
      </figcaption>
      <pre tabIndex={0} aria-label={`${lang || "Text"} code`}>
        <code>{code}</code>
      </pre>
    </figure>
  );
}
