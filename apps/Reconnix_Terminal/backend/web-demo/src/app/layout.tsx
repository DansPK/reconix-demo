import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/navbar";

export const metadata: Metadata = {
  title: "ShopWave — Gear that moves you",
  description: "Demo ecommerce storefront.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Navbar />
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <footer className="border-t mt-16">
          <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted-foreground flex justify-between">
            <span>© 2026 ShopWave</span>
            <span>Demo environment · not a real store</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
