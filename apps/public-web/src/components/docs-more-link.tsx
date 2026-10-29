import Link from "next/link";
import { ArrowRight } from "lucide-react";

/** "Read the docs →" under a landing section's heading: the landing stays short, the detail lives in the docs. */
export function DocsMoreLink({ href, label = "Read the docs" }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.16em] text-primary hover:text-foreground"
    >
      {label}
      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}
