import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { SITE_NAME } from "@/lib/site";
import "./globals.css";

// Inter drives both display and body (the SOC dashboard uses one clean geometric sans);
// JetBrains Mono stays for chips, ticks, timestamps and code. Variable names are
// unchanged so the docs and the ui/ primitives keep resolving --font-display / --font-body /
// --font-mono.
const display = Inter({ subsets: ["latin"], variable: "--font-display" });
const body = Inter({ subsets: ["latin"], variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: { default: `${SITE_NAME} analysis`, template: `%s · ${SITE_NAME} analysis` },
  description: "The assessments the Reconix terminal app saved on this computer.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="min-h-screen antialiased">
        {/* No smooth scrolling library: the dashboard and the docs (which share its frame)
            scroll natively, because on a desktop frame the scroller is the content area
            (.dash-content), not the window. */}
        {children}
      </body>
    </html>
  );
}
