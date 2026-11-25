import type { LucideIcon } from "lucide-react";
import { DOCS_ROUTES } from "@/lib/docs-nav";


export const SITE_URL = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const SITE_NAME = "Reconix";
export const SITE_TAGLINE = "AI-planned security assessments inside an approved scope.";
export const SITE_DESCRIPTION =
  "An AI-powered terminal assistant that plans authorized security assessments, keeps every action inside an approved scope, and turns tool results into clear findings and reports.";

export const SITE_REPO_URL = "https://github.com/14th-Generation-Advanced-Course";

export const SITE_NAME_MEANING: string | undefined = undefined;
/** true once the tool repository is public under an open-source license (changes the footer's copyright line). */
export const SITE_OPEN_SOURCE = false;

export type CommunityLink = { label: string; href: string; icon?: LucideIcon };

export const SITE_COMMUNITY: CommunityLink[] = [];
/** Every public route, for the sitemap: the landing page plus every docs route from DOCS_NAV. */
export const SITE_ROUTES: string[] = ["/", ...DOCS_ROUTES];
