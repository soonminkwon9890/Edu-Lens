const STATS = [
  { value: "<2초",    label: "막힘 감지 지연 시간"  },
  { value: "3단계",   label: "소크라테스식 힌트"    },
  { value: "100%",   label: "프라이버시 우선 캡처"  },
  { value: "실시간", label: "교사 레이더"           },
] as const;

export function StatsSection() {
  return (
    <section aria-label="주요 지표" className="border-y border-border/50 bg-card/30">
      <div className="container py-10">
        <dl className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {STATS.map(({ value, label }) => (
            <div key={label} className="flex flex-col items-center text-center gap-1">
              <dt className="text-3xl font-extrabold text-gradient">{value}</dt>
              <dd className="text-sm text-muted-foreground">{label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
