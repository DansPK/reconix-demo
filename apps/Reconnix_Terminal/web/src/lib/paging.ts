/* Paging rules shared by the lists that show 10 rows at a time (Findings, Assessments, the
   runs of a report) and the report's targets (7 a page, `?tpage=`: report-targets-paging.ts).
   Pure: the views keep the page in the address (`?page=`), so anything unknown is clamped
   rather than trusted. */

export const PER_PAGE = 10;

export interface Paging {
  page: number; // 1-based, clamped into [1, pages]
  pages: number; // at least 1
  start: number; // index of the first row on this page
  end: number; // index after the last row on this page
  total: number;
  label: string; // "Page 2 of 3 · 30 results"
}

/** The page `raw` names (an address value), clamped so that there is always a page to show. */
export function paginate(total: number, raw: string | number | null | undefined, perPage = PER_PAGE): Paging {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const wanted = typeof raw === "number" ? raw : parseInt(raw ?? "", 10);
  const page = Number.isFinite(wanted) ? Math.min(pages, Math.max(1, Math.trunc(wanted))) : 1;
  const start = (page - 1) * perPage;
  const end = Math.min(total, start + perPage);
  const results = `${total} ${total === 1 ? "result" : "results"}`;
  return { page, pages, start, end, total, label: pages > 1 ? `Page ${page} of ${pages} · ${results}` : results };
}

/** The page that holds row `index` (a deep link to one row opens its page). */
export const pageOf = (index: number, perPage = PER_PAGE) => (index < 0 ? 1 : Math.floor(index / perPage) + 1);

/** The rows of one page. */
export const slicePage = <T>(rows: T[], paging: Paging): T[] => rows.slice(paging.start, paging.end);
