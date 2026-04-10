interface Props {
  label:   string;
  value:   number | string;
  sub?:    string;
  accent?: "default" | "red" | "amber" | "green";
  icon?:   string;
}

const ACCENT_CLS = {
  default: "text-edu-400",
  red:     "text-red-400",
  amber:   "text-amber-400",
  green:   "text-green-400",
} as const;

export function MetricCard({ label, value, sub, accent = "default", icon }: Props) {
  return (
    <div className="flex-1 min-w-0 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground">
          {label}
        </p>
        {icon && <span className="text-xl leading-none opacity-60">{icon}</span>}
      </div>
      <p className={`text-3xl font-bold tabular-nums ${ACCENT_CLS[accent]}`}>{value}</p>
      {sub && (
        <p className="text-[11px] text-muted-foreground mt-1.5">{sub}</p>
      )}
    </div>
  );
}
