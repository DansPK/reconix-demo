/* Shared search input bounds and cleaning (pure: browser and tests). Strips ASCII control
   characters and caps length so oversized or malformed query values from inputs or `?q=`
   never bloat URLs or filters. */

export const MAX_SEARCH_QUERY = 200;

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/** Remove ASCII control characters and cap a search query at MAX_SEARCH_QUERY chars. */
export function cleanSearchQuery(raw: string): string {
  return raw.replace(CONTROL_CHARS, "").slice(0, MAX_SEARCH_QUERY);
}
