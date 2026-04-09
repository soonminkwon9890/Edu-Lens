import {
  Eye,
  BrainCircuit,
  ShieldCheck,
  Activity,
  MessageSquareMore,
  BarChart3,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const FEATURES = [
  {
    icon: Eye,
    title: "비전 진단 엔진",
    description:
      `Gemini 1.5 Flash가 학생의 활성 워크스페이스 창을 분석합니다 — 전체 화면이 아닌 필요한 부분만 캡처해 최대한의 프라이버시와 정확성을 보장합니다.`,
  },
  {
    icon: BrainCircuit,
    title: "소크라테스식 힌트 시스템",
    description:
      `3단계로 점진적으로 안내합니다: 말풍선 알림, 방향을 제시하는 1단계 힌트, 상세한 설명의 2단계 힌트. 학생이 정답을 받는 게 아니라 스스로 발견하도록 유도합니다.`,
  },
  {
    icon: Activity,
    title: "실시간 교사 레이더",
    description:
      `Supabase 실시간 기능이 모든 막힘 이벤트를 즉시 관리자 대시보드로 전달합니다. 3회 이상 막힌 위급 학생은 빨간 알림과 함께 최상단에 고정됩니다.`,
  },
  {
    icon: ShieldCheck,
    title: "프라이버시 우선 캡처",
    description:
      `인식된 워크스페이스 도구(VS Code, Figma, PyCharm 등)에서만 캡처가 실행됩니다. 브라우저나 채팅 앱으로 전환하면 대신 부드러운 알림이 표시됩니다.`,
  },
  {
    icon: MessageSquareMore,
    title: "정밀 문제 위치 파악",
    description:
      `Gemini가 0–1000 좌표계의 바운딩 박스를 반환하면, 에듀렌즈가 이를 정확한 화면 픽셀로 변환해 오류 위치에 맥동하는 빨간 하이라이트를 그립니다.`,
  },
  {
    icon: BarChart3,
    title: "학습 분석",
    description:
      `모든 막힘, 힌트 상호작용, 해결 과정이 Supabase에 기록됩니다. 교사는 진도를 추적하고, 반복되는 장애물을 파악하며, 실시간으로 커리큘럼을 조정할 수 있습니다.`,
  },
] as const;

export function FeaturesSection() {
  return (
    <section
      id="features"
      className="py-20 md:py-28"
      aria-labelledby="features-heading"
    >
      <div className="container">
        {/* ── Section header ─────────────────────────────────────── */}
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-xs font-semibold uppercase tracking-widest text-lens-400 mb-3">
            주요 기능
          </p>
          <h2
            id="features-heading"
            className="text-3xl font-extrabold tracking-tight md:text-4xl"
          >
            현대적인{" "}
            <span className="text-gradient">교육 도구</span>에 필요한 모든 것
          </h2>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            에듀렌즈는 컴퓨터 비전, 생성형 AI, 실시간 인프라를 하나의 경험으로 통합합니다.
          </p>
        </div>

        {/* ── Feature grid ───────────────────────────────────────── */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <Card
              key={title}
              className="group relative overflow-hidden transition-all duration-300
                         hover:border-lens-500/50 hover:shadow-lg hover:shadow-lens-500/10
                         hover:-translate-y-0.5"
            >
              {/* Hover glow */}
              <span
                aria-hidden
                className="absolute inset-0 bg-gradient-to-br from-lens-500/5 to-transparent
                           opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
              />
              <CardHeader>
                <div
                  className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl
                             bg-lens-500/15 border border-lens-500/25 group-hover:bg-lens-500/20
                             transition-colors"
                >
                  <Icon className="h-5 w-5 text-lens-400" aria-hidden />
                </div>
                <CardTitle className="text-base">{title}</CardTitle>
                <CardDescription className="text-sm leading-relaxed">
                  {description}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
