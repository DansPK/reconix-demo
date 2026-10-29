/* A log event's status as a badge: a status meaning, or the severity of the finding it names. */
import type { EventBadge as EventBadgeData } from "@/components/dashboard/overview-types";
import { SeverityBadge, StatusBadge } from "@/components/ui/status-badge";

export function EventBadge({ badge }: { badge: EventBadgeData }) {
  return badge.type === "severity" ? <SeverityBadge level={badge.level} /> : <StatusBadge meaning={badge.meaning} />;
}

/** The badge's words, for tooltips and accessible names. */
export const badgeText = (badge: EventBadgeData) => (badge.type === "severity" ? `${badge.level.toLowerCase()} severity` : badge.meaning.label);
