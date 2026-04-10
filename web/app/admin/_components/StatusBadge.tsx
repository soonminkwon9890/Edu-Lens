import type { SessionStatus } from "../_lib/types";

const MAP: Record<SessionStatus, { label: string; cls: string }> = {
  critical: {
    label: "위급",
    cls:   "bg-red-500/20 text-red-400 border-red-500/40",
  },
  stalled: {
    label: "막힘",
    cls:   "bg-amber-500/20 text-amber-400 border-amber-500/40",
  },
  active: {
    label: "정상",
    cls:   "bg-green-500/20 text-green-400 border-green-500/40",
  },
  resolved: {
    label: "해결됨",
    cls:   "bg-sky-500/20 text-sky-400 border-sky-500/40",
  },
};

interface Props {
  status:    SessionStatus;
  className?: string;
}

export function StatusBadge({ status, className = "" }: Props) {
  const { label, cls } = MAP[status] ?? {
    label: status,
    cls:   "bg-muted/20 text-muted-foreground border-border",
  };

  return (
    <span
      className={`inline-flex items-center text-[10px] font-semibold
                  px-2 py-0.5 rounded-full border ${cls} ${className}`}
    >
      {label}
    </span>
  );
}
