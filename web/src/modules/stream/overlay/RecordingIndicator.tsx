// web/src/modules/stream/overlay/RecordingIndicator.tsx

function formatTimer(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = m.toString().padStart(2, "0");
  const ss = s.toString().padStart(2, "0");
  if (h > 0) return `${h}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

export function RecordingIndicator({
  seconds,
  unlimited = false,
}: {
  seconds: number;
  unlimited?: boolean;
}) {
  let colorClass = "text-green-400";
  const dotClass = "bg-red-500 animate-pulse";
  // Color escalation only applies when there's a 10-minute limit; in
  // unlimited mode (FS API direct-to-disk) we stay green forever.
  if (!unlimited) {
    if (seconds >= 570) {
      colorClass = "text-red-400 animate-pulse";
    } else if (seconds >= 540) {
      colorClass = "text-amber-400";
    }
  }

  return (
    <div className="flex items-center gap-2 bg-black/60 px-3 py-2 rounded text-xs font-mono">
      <span className={`inline-block w-2 h-2 rounded-full ${dotClass}`} />
      <span className={colorClass}>REC {formatTimer(seconds)}</span>
    </div>
  );
}
