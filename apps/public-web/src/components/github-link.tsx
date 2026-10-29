import { siGithub } from "simple-icons";
import { SITE_REPO_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

/** GitHub mark linking to the Reconix repository (SITE_REPO_URL). Icon-only unless `label` is given. */
export function GithubLink({ className, label }: { className?: string; label?: string }) {
  return (
    <a
      href={SITE_REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label ? undefined : "Reconix on GitHub"}
      className={cn("inline-flex items-center gap-2 transition-colors", className)}
    >
      <svg viewBox="0 0 24 24" className="size-[18px] shrink-0 fill-current" aria-hidden>
        <path d={siGithub.path} />
      </svg>
      {label}
    </a>
  );
}
