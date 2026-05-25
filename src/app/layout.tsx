import type { Metadata } from "next";
import "./globals.css";

/**
 * Fonts are loaded via plain <link> tags rather than `next/font/google` so
 * the build succeeds in restricted/offline networks. The runtime experience
 * is identical: the browser fetches the same Google Fonts.
 */

export const metadata: Metadata = {
  title: "VibeGraph — Visual editor for Vibes workflow templates",
  description:
    "A bidirectional visual editor for Vibes. Canvas + YAML, always in sync. Real control flow, real variable scope, real validation.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
