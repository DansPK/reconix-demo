// Renders Markdown from the analyzer to HTML for the webview (pure Node, no vscode import).
// Raw HTML in the source is escaped (html: false) and markdown-it refuses javascript:/data: links,
// so the result is safe to put into the webview, whose CSP also blocks inline scripts.
import MarkdownIt from "markdown-it";

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

export function renderMarkdown(text: string): string {
  return md.render(text);
}
