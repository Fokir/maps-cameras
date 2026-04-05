// web/src/modules/stream/overlay/RecordingIndicator.tsx

function formatTimer(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function RecordingIndicator({ seconds }: { seconds: number }) {
  let colorClass = "text-green-400";
  let dotClass = "bg-red-500 animate-pulse";
  if (seconds >= 570) {
    colorClass = "text-red-400 animate-pulse";
  } else if (seconds >= 540) {
    colorClass = "text-amber-400";
  }

  return (
    <div className="flex items-center gap-2 bg-black/60 px-3 py-2 rounded text-xs font-mono">
      <span className={`inline-block w-2 h-2 rounded-full ${dotClass}`} />
      <span className={colorClass}>REC {formatTimer(seconds)}</span>
    </div>
  );
}
