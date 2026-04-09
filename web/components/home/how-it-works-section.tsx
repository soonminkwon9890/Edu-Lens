import { ScanSearch, Lightbulb, CheckCircle2, Radio } from "lucide-react";

const STEPS = [
  {
    icon: ScanSearch,
    step: "01",
    title: "학생이 에듀렌즈 캐릭터를 더블클릭합니다",
    description:
      `떠 있는 🤖 위젯이 macOS Quartz를 이용해 활성 워크스페이스 창(VS Code, Figma 등)만 캡처합니다. 워크스페이스가 아닌 앱이 포커스되어 있으면 부드러운 알림이 대신 표시됩니다.`,
  },
  {
    icon: Radio,
    step: "02",
    title: "Gemini가 스크린샷을 분석합니다",
    description:
      `잘라낸 이미지가 구조화된 프롬프트와 함께 Gemini 1.5 Flash로 전송됩니다. 모델은 막힘 위치를 0–1000 바운딩 박스와 2단계 힌트로 반환합니다.`,
  },
  {
    icon: Lightbulb,
    step: "03",
    title: "소크라테스식 힌트가 학생을 안내합니다",
    description:
      `말풍선이 "힌트가 필요하신가요?"라고 묻습니다 — 1단계는 막연한 방향을, 2단계는 상세한 설명을 제공합니다. 맥동하는 빨간 오버레이가 화면에서 정확한 문제 위치를 표시합니다.`,
  },
  {
    icon: CheckCircle2,
    step: "04",
    title: "해결 내용이 기록되고 교사에게 알림이 전송됩니다",
    description:
      `학생이 "✅ 해결 완료"를 클릭하면 색종이 폭죽이 터지고 해결 이벤트가 Supabase에 저장됩니다. 관리자 레이더가 실시간으로 업데이트됩니다.`,
  },
] as const;

export function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className="py-20 md:py-28 bg-card/20 border-y border-border/50"
      aria-labelledby="how-heading"
    >
      <div className="container">
        {/* ── Section header ─────────────────────────────────────── */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-xs font-semibold uppercase tracking-widest text-lens-400 mb-3">
            작동 방식
          </p>
          <h2
            id="how-heading"
            className="text-3xl font-extrabold tracking-tight md:text-4xl"
          >
            막힘에서{" "}
            <span className="text-gradient">돌파구</span>까지, 단 몇 초 만에
          </h2>
        </div>

        {/* ── Steps ──────────────────────────────────────────────── */}
        <ol className="relative max-w-3xl mx-auto" role="list">
          {/* Vertical connector line */}
          <div
            aria-hidden
            className="absolute left-7 top-10 bottom-10 w-px bg-gradient-to-b
                       from-lens-500/60 via-lens-500/20 to-transparent hidden md:block"
          />

          {STEPS.map(({ icon: Icon, step, title, description }, idx) => (
            <li
              key={step}
              className="relative flex gap-5 md:gap-7 mb-10 last:mb-0"
            >
              {/* Step bubble */}
              <div className="shrink-0 flex flex-col items-center">
                <div
                  className="relative z-10 flex h-14 w-14 items-center justify-center
                             rounded-2xl border border-lens-500/40 bg-lens-500/10
                             shadow-md shadow-lens-500/20"
                >
                  <Icon className="h-6 w-6 text-lens-400" aria-hidden />
                  <span
                    className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full
                               bg-lens-gradient flex items-center justify-center
                               text-[10px] font-bold text-white"
                  >
                    {idx + 1}
                  </span>
                </div>
              </div>

              {/* Content */}
              <div className="pt-1.5 pb-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-lens-500/70 mb-1">
                  Step {step}
                </p>
                <h3 className="font-semibold text-base mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
