/* The knowledge files as a table: Name (with its type's icon; the row's header), Source ("Web
   upload · PDF · 1.2 MB"), Uploaded (local date and time) and the actions (Open, Remove). On a
   phone each row stacks into a block, its cells labelled (knowledge.css), so nothing scrolls
   sideways; wider, the table scrolls inside its own box if a long word ever makes it wider than
   the card. */
import { addedAtLabel, ORIGIN_LABEL, typeAndSize } from "@/lib/knowledge/format";
import type { KnowledgeItem } from "@/lib/knowledge/types";

import { FileActions } from "./file-actions";
import { KindIcon } from "./kind-icon";

export function FileTable({ items, onRemove }: { items: KnowledgeItem[]; onRemove: (item: KnowledgeItem) => Promise<string | null> }) {
  return (
    <div className="dash-table-scroll">
      <table aria-label="Knowledge files" className="dash-table kn-table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Source</th>
            <th scope="col">Uploaded</th>
            <th scope="col" className="kn-col-actions">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <th scope="row" className="font-normal">
                <span className="kn-name-cell">
                  <KindIcon kind={item.kind} />
                  <span className="kn-name" title={item.name}>
                    {item.name}
                  </span>
                </span>
              </th>
              <td data-label="Source">
                <span className="text-foreground">{ORIGIN_LABEL[item.source]}</span>
                <span className="text-muted-foreground"> · {typeAndSize(item)}</span>
              </td>
              <td data-label="Uploaded" className="whitespace-nowrap text-muted-foreground">
                <time dateTime={item.addedAt}>{addedAtLabel(item.addedAt)}</time>
              </td>
              <td className="kn-col-actions">
                <FileActions item={item} onRemove={onRemove} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
