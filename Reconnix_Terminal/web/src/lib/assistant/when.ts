/* When a conversation was last used, in words, and the History menu's date groups. Uses the
   browser's own clock and time zone. Pure (the time is passed in). */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 86_400_000;

const startOfDay = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** "just now", "5 min ago", "3 h ago", "yesterday", "5 Oct" (with the year when not this one). */
export function ago(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return "just now";
  if (s < 3_600) return `${Math.floor(s / 60)} min ago`;
  const days = Math.round((startOfDay(now) - startOfDay(ms)) / DAY_MS);
  if (days === 0) return `${Math.floor(s / 3_600)} h ago`;
  if (days === 1) return "yesterday";
  const d = new Date(ms);
  const year = d.getFullYear() === new Date(now).getFullYear() ? "" : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${year}`;
}

export type Group = "Today" | "Yesterday" | "Previous 7 days" | "Older";

export function groupOf(ms: number, now: number): Group {
  const days = Math.round((startOfDay(now) - startOfDay(ms)) / DAY_MS);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return days <= 7 ? "Previous 7 days" : "Older";
}
