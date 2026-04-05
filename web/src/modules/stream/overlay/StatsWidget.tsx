import type { StreamStats } from "../hooks/useStreamStats";

function formatBitrate(bps: number | null): string {
  if (bps === null) return "—";
  const mbps = bps / 1_000_000;
  return `${mbps.toFixed(1)} Mbps`;
}

function formatNumber(n: number | null, suffix = ""): string {
  return n === null ? "—" : `${n}${suffix}`;
}

function formatLoss(loss: number | null): string {
  if (loss === null) return "—";
  return `${loss.toFixed(1)}%`;
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

export function StatsWidget({ stats }: { stats: StreamStats }) {
  const transportLabel = stats.transport === "webrtc" ? "WebRTC" : stats.transport === "mse" ? "MSE" : "…";
  const tooltip = [
    stats.resolution ? `${stats.resolution.w}×${stats.resolution.h}` : null,
    stats.codec,
    stats.jitterMs !== null ? `jitter ${stats.jitterMs.toFixed(0)} ms` : null,
    `received ${formatBytes(stats.receivedBytes)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="absolute right-2 bottom-2 bg-black/60 text-white text-xs font-mono px-3 py-2 rounded pointer-events-auto select-none"
      title={tooltip}
    >
      <div className="font-bold">{transportLabel}</div>
      <div>Bitrate: {formatBitrate(stats.bitrate)}</div>
      <div>FPS: {formatNumber(stats.fps)}</div>
      <div>Loss: {formatLoss(stats.loss)}</div>
    </div>
  );
}
