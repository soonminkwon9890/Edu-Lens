"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X, Aperture } from "lucide-react";

import { cn } from "@/lib/utils";
import { NAV_LINKS, SITE_NAME } from "@/lib/constants";
import { Button } from "@/components/ui/button";

export function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-md">
      <nav
        className="container flex h-16 items-center justify-between"
        aria-label="Primary navigation"
      >
        {/* ── Logo ─────────────────────────────────────────────────── */}
        <Link
          href="/"
          className="flex items-center gap-2.5 font-bold text-lg tracking-tight group"
          aria-label={`${SITE_NAME} home`}
        >
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg
                       bg-lens-gradient shadow-md shadow-lens-500/30
                       group-hover:shadow-lens-500/50 transition-shadow"
          >
            <Aperture className="h-4 w-4 text-white" aria-hidden />
          </span>
          <span className="text-gradient">{SITE_NAME}</span>
        </Link>

        {/* ── Desktop links ─────────────────────────────────────────── */}
        <ul className="hidden md:flex items-center gap-1" role="list">
          {NAV_LINKS.map(({ label, href }) => {
            const active = pathname === href;
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                    active
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* ── Desktop CTA ───────────────────────────────────────────── */}
        <div className="hidden md:flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">로그인</Link>
          </Button>
          <Button variant="glow" size="sm" asChild>
            <Link href="/dashboard">대시보드 시작하기</Link>
          </Button>
        </div>

        {/* ── Mobile hamburger ──────────────────────────────────────── */}
        <button
          className="md:hidden p-2 rounded-lg text-muted-foreground
                     hover:text-foreground hover:bg-accent transition-colors"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? "메뉴 닫기" : "메뉴 열기"}
          aria-expanded={mobileOpen}
          aria-controls="mobile-menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {/* ── Mobile menu ────────────────────────────────────────────── */}
      {mobileOpen && (
        <div
          id="mobile-menu"
          className="md:hidden border-t border-border/50 bg-background/95 backdrop-blur-md"
        >
          <ul className="container py-4 flex flex-col gap-1" role="list">
            {NAV_LINKS.map(({ label, href }) => {
              const active = pathname === href;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "block px-4 py-2.5 rounded-lg text-sm font-medium transition-colors",
                      active
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    {label}
                  </Link>
                </li>
              );
            })}

            <li className="mt-3 pt-3 border-t border-border/50 flex flex-col gap-2">
              <Button variant="outline" size="sm" asChild className="w-full">
                <Link href="/login" onClick={() => setMobileOpen(false)}>
                  로그인
                </Link>
              </Button>
              <Button variant="glow" size="sm" asChild className="w-full">
                <Link href="/dashboard" onClick={() => setMobileOpen(false)}>
                  대시보드 시작하기
                </Link>
              </Button>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}
