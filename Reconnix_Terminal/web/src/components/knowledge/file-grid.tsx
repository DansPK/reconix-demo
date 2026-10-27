/* The knowledge files as cards, the table's data in another shape: the type's icon and the name,
   the source line ("Web upload · PDF · 1.2 MB"), when it was uploaded, and the actions (Open,
   Remove). As many columns as fit, one on a phone. */
import { addedAtLabel, sourceLine } from "@/lib/knowledge/format";
import type { KnowledgeItem } from "@/lib/knowledge/types";

import { FileActions } from "./file-actions";
import { KindIcon } from "./kind-icon";

export function FileGrid({ items, onRemove }: { items: KnowledgeItem[]; onRemove: (item: KnowledgeItem) => Promise<string | null> }) {
  return (
    <ul aria-label="Knowledge files" className="kn-grid">
      {items.map((item) => (
        <li key={item.id} className="kn-tile">
          <div className="kn-tile-head">
            <KindIcon kind={item.kind} large />
            <h3 className="kn-tile-name" title={item.name}>
              {item.name}
            </h3>
          </div>
          <p className="kn-tile-meta">{sourceLine(item)}</p>
          <p className="kn-tile-meta">
            Uploaded <time dateTime={item.addedAt}>{addedAtLabel(item.addedAt)}</time>
          </p>
          <FileActions item={item} onRemove={onRemove} />
        </li>
      ))}
    </ul>
  );
}
