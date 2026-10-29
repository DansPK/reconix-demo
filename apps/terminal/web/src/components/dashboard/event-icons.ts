/* The icon of each activity-log kind, beside its lane's name (event-kinds.ts has the names). */
import { Bug, EyeOff, Hand, Info, ShieldCheck, ShieldX, UserRound, Wrench, type LucideIcon } from "lucide-react";

import type { LogKind } from "@/lib/data/view-types";

export const KIND_ICON: Record<LogKind, LucideIcon> = {
  scope: ShieldCheck,
  policy: ShieldX,
  tool: Wrench,
  finding: Bug,
  gate: Hand,
  user: UserRound,
  info: Info,
  mask: EyeOff,
};
