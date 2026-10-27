/* The every-run Report's Targets card pages (report-targets.tsx): seven targets a page, the
   page in the address as `?tpage=` (view-url.ts REPORT_KEYS; the runs table below keeps its own
   page in state), clamped like every other page (lib/paging.ts), so anything unknown in the
   address lands on a page that exists. Pure. */
import { type Paging, paginate, slicePage } from "@/lib/paging";

import { pageParam } from "./filters";

export const TARGETS_PER_PAGE = 7;

export interface TargetsPage<T> {
  paging: Paging;
  rows: T[]; // this page's targets
  slots: number; // the rows the list keeps room for: a whole page once there is more than one
}

/** The page of `targets` that the address value `raw` names. */
export function targetsPage<T>(targets: T[], raw: string | null | undefined): TargetsPage<T> {
  const paging = paginate(targets.length, raw, TARGETS_PER_PAGE);
  return { paging, rows: slicePage(targets, paging), slots: Math.min(TARGETS_PER_PAGE, targets.length) };
}

/** The address change that opens `page` (the first page is the plain address). */
export const targetsPagePatch = (page: number): { tpage: string } => ({ tpage: pageParam(page) });
