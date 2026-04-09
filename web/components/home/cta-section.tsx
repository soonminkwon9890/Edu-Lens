import Link from "next/link";
import { ArrowRight, Github } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CtaSection() {
  return (
    <section
      className="py-20 md:py-28"
      aria-labelledby="cta-heading"
    >
      <div className="container">
        <div
          className="relative overflow-hidden rounded-3xl border border-lens-500/30
                     bg-gradient-to-br from-lens-950 via-lens-900/60 to-background
                     p-10 md:p-16 text-center shadow-2xl shadow-lens-500/10"
        >
          {/* Background glow */}
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-radial from-lens-500/15
                       via-transparent to-transparent pointer-events-none"
          />

          <p className="relative text-xs font-semibold uppercase tracking-widest text-lens-400 mb-4">
            지금 시작하세요
          </p>

          <h2
            id="cta-heading"
            className="relative text-3xl font-extrabold tracking-tight md:text-5xl text-balance"
          >
            학생이 헤매는 걸 지켜보지만 마세요.{" "}
            <span className="text-gradient">에듀렌즈를 시작하세요.</span>
          </h2>

          <p className="relative mt-5 max-w-xl mx-auto text-muted-foreground leading-relaxed text-balance">
            관리자 대시보드를 열어 실시간 막힘 이벤트를 확인하거나,
            Python 데스크톱 에이전트를 다운로드해 5분 안에 시작해보세요.
          </p>

          <div className="relative mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button variant="glow" size="xl" asChild>
              <Link href="/dashboard">
                관리자 대시보드 열기
                <ArrowRight className="h-5 w-5" aria-hidden />
              </Link>
            </Button>

            <Button variant="outline" size="xl" asChild className="gap-2">
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="h-5 w-5" aria-hidden />
                GitHub에서 보기
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
