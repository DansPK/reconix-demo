/* The muted line under an answer that names the /add-on files whose passages the model was given
   with the question ("Knowledge used: a.md, b.pdf"): the server's `meta` frame, kept with the
   saved reply. Names only, rendered as text; the files themselves never reach the page. */
import { BookOpen } from "lucide-react";

export function KnowledgeUsed({ names }: { names?: string[] }) {
  if (!names?.length) return null;
  return (
    <p className="ai-knowledge">
      <BookOpen className="size-3.5 shrink-0" aria-hidden />
      <span>Knowledge used: {names.join(", ")}</span>
    </p>
  );
}
