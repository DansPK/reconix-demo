/* A knowledge file's type as an icon on a small tile (decorative: the type is always written
   beside it, in the Source line). */
import { FileBraces, FileCode, FileText, FileType, type LucideIcon } from "lucide-react";

import type { KnowledgeKind } from "@/lib/knowledge/types";
import { cn } from "@/lib/utils";

const ICONS: Record<KnowledgeKind, LucideIcon> = {
  pdf: FileText,
  docx: FileType,
  txt: FileText,
  md: FileCode,
  json: FileBraces,
  yaml: FileCode,
};

export function KindIcon({ kind, large = false }: { kind: KnowledgeKind; large?: boolean }) {
  const Icon = ICONS[kind];
  return (
    <span aria-hidden className={cn("kn-kind", large && "is-large")} data-kind={kind}>
      <Icon strokeWidth={1.6} />
    </span>
  );
}
