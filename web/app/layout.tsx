import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import "@/app/globals.css";
import { Providers } from "@/app/providers";

// ── Fonts ─────────────────────────────────────────────────────────────────────
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

// ── Metadata ──────────────────────────────────────────────────────────────────
export const metadata: Metadata = {
  title: {
    default:  "EduLens",
    template: "%s | EduLens",
  },
  description:
    "EduLens is an AI-powered educational assistant that detects coding stalls in real time and guides students with Socratic hints.",
  authors:  [{ name: "EduLens Team" }],
  robots:   { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor:   "#7c5cfc",
  width:        "device-width",
  initialScale: 1,
};

// ── Root Layout ───────────────────────────────────────────────────────────────
// The global Navbar/Footer are intentionally removed — every app section
// (student dashboard, admin radar, sign-in, onboarding) provides its own
// context-appropriate header with a <UserButton /> for logout.
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4
                       focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg
                       focus:bg-primary focus:text-primary-foreground"
          >
            Skip to content
          </a>
          <main id="main-content" className="min-h-screen">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
