import { HydratedMark } from "@/components/dashboard/hydrated-mark";
import { Sidebar } from "@/components/dashboard/sidebar";
import { DocsTopBar } from "@/components/docs-top-bar";

/**
 * Chrome for every /docs/** route: the dashboard's own frame (the same sidebar, a top bar and
 * the content area), so the documentation is one more tab of the local viewer, not a separate
 * site. The sidebar's views link back to `/?view=…`; its Documentation item is the one marked.
 * The session check is the second lock behind src/proxy.ts, and it makes the docs render per
 * request, so they carry the proxy's CSP nonce like every other page. Server component.
 *
 * The docs scroll natively, like the dashboard (frame.css): on the fixed desktop frame the
 * content area is the scroller, elsewhere the window. `data-docs` turns off the dashboard's
 * intro reveal (the docs have no intro) and turns on smooth hash links (dashboard.css).
 */
export default async function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dash-page" data-docs="">
      <HydratedMark />
      <div className="dash-frame">
        <Sidebar active={null} />
        <DocsTopBar />
        {/* tabIndex -1: focusable by script and click, so the keys scroll it (no tab stop) */}
        <main className="dash-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
