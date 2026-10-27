"use client";

/* A link to one saved run that keeps the open view (Report stays Report): the Report view's
   rows use it. */
import Link from "next/link";
import { useRunHref } from "@/components/dashboard/view-url";
import { cn } from "@/lib/utils";

export function RunLinkTo({ uid, label, className, children }: { uid: string; label: string; className?: string; children: React.ReactNode }) {
  const href = useRunHref();
  return (
    <Link
      href={href(uid)}
      aria-label={label}
      title={label}
      className={cn("rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
    >
      {children}
    </Link>
  );
}
