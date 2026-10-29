import type { LucideIcon } from "lucide-react";
import { DOCS_ROUTES } from "@/lib/docs-nav";

/**
 * Site-wide identity used by the metadata in layout.tsx, robots.ts, sitemap.ts
 * and the OpenGraph image. `SITE_URL` must be known at build time (pages are
 * prerendered), so pass it as a Docker build arg / CI env; it falls back to
 * localhost for local builds.
 */
export const SITE_URL = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const SITE_NAME = "Reconix";
export const SITE_TAGLINE = "AI-planned security assessments inside an approved scope.";
export const SITE_DESCRIPTION =
  "An AI-powered terminal assistant that plans authorized security assessments, keeps every action inside an approved scope, and turns tool results into clear findings and reports.";
/**
 * The Reconix tool's source repository (GitHub link in the navbar and footer).
 * Placeholder: replace with the real repository URL.
 */
export const SITE_REPO_URL = "https://github.com/<org>/reconix";
/**
 * What the name stands for, shown under the footer wordmark. Set it (e.g.
 * "Reconnaissance with Intelligence Transformation") once it is the official meaning;
 * until then the footer shows SITE_TAGLINE.
 */
export const SITE_NAME_MEANING: string | undefined = undefined;
/** true once the tool repository is public under an open-source license (changes the footer's copyright line). */
export const SITE_OPEN_SOURCE = false;

export type CommunityLink = { label: string; href: string; icon?: LucideIcon };
/**
 * Contact / community links for the footer (Community column + icon row), empty until the team
 * has real ones. Examples:
 *   { label: "Email", href: "mailto:team@example.com", icon: Mail },
 *   { label: "Discord", href: "https://discord.gg/<invite>", icon: MessagesSquare },
 */
export const SITE_COMMUNITY: CommunityLink[] = [];
/** Every public route, for the sitemap: the landing page plus every docs route from DOCS_NAV. */
export const SITE_ROUTES: string[] = ["/", ...DOCS_ROUTES];
