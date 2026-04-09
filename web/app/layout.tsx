import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import "@/app/globals.css";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Providers } from "@/app/providers";

// ── Fonts ────────────────────────────────────────────────────────────────
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

// ── Metadata ─────────────────────────────────────────────────────────────
export const metadata: Metadata = {
  title: {
    default: "EduLens — The lens that clarifies education",
    template: "%s | EduLens",
  },
  description:
    "EduLens is an AI-powered educational assistant that detects coding stalls in real time and guides students with Socratic hints — so instructors can focus on teaching.",
  keywords: [
    "education",
    "AI tutor",
    "coding assistant",
    "learning analytics",
    "VS Code",
    "PyCharm",
  ],
  authors: [{ name: "EduLens Team" }],
  openGraph: {
    type: "website",
    locale: "en_US",
    title: "EduLens — The lens that clarifies education",
    description:
      "Real-time AI diagnostics for students, live oversight for instructors.",
    siteName: "EduLens",
  },
  twitter: {
    card: "summary_large_image",
    title: "EduLens",
    description: "The lens that clarifies education.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#7c5cfc",
  width: "device-width",
  initialScale: 1,
};

// ── Root Layout ───────────────────────────────────────────────────────────
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-screen flex flex-col bg-background text-foreground">
        <Providers>
          {/* Skip-to-content for accessibility */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4
                       focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg
                       focus:bg-primary focus:text-primary-foreground"
          >
            Skip to content
          </a>

          <Navbar />

          <main id="main-content" className="flex-1">
            {children}
          </main>

          <Footer />
        </Providers>
      </body>
    </html>
  );
}
