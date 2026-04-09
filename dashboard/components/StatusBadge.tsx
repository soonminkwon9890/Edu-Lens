import type { LogStatus } from "@/types/database";

interface Props {
  status: LogStatus;
  className?: string;
}

const MAP: Record<LogStatus, { label: string; cls: string }> = {
  critical: {
    label: "위급",
    cls: "bg-red-500/20 text-red-400 border border-red-500/40",
  },
  stalled: {
    label: "막힘",
    cls: "bg-amber-500/20 text-amber-400 border border-amber-500/40",
  },
  resolved: {
    label: "해결됨",
    cls: "bg-green-500/20 text-green-400 border border-green-500/40",
  },
};

export default function StatusBadge({ status, className = "" }: Props) {
  const { label, cls } = MAP[status];
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-widest ${cls} ${className}`}
    >
      {label}
    </span>
  );
}
