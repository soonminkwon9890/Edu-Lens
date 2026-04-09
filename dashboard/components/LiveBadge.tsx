interface Props {
  connected: boolean;
}

export default function LiveBadge({ connected }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold
                  border transition-colors duration-500
                  ${
                    connected
                      ? "bg-green-500/10 text-green-400 border-green-500/30"
                      : "bg-radar-muted/10 text-radar-muted border-radar-border"
                  }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          connected ? "bg-green-400 animate-pulse" : "bg-radar-muted"
        }`}
      />
      {connected ? "실시간" : "오프라인"}
    </span>
  );
}
