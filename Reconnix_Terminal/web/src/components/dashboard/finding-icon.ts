/* The icon for a finding row, from the kind of issue derive.ts read from its category/title. */
import { Bug, Code, Database, type LucideIcon } from "lucide-react";

import type { FindingIcon } from "@/components/dashboard/derive";

export const FINDING_ICON: Record<FindingIcon, LucideIcon> = { bug: Bug, code: Code, database: Database };
