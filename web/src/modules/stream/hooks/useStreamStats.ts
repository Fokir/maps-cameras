// web/src/modules/stream/hooks/useStreamStats.ts
import { useEffect, useRef, useState } from "react";
import type { TransportHandle, TransportKind } from "../transports/types";

export interface StreamStats {
  transport: TransportKind | null;
  bitrate: number | null; // bits per second
  fps: number | null;
  loss: number | null; // percent, null for MSE
  resolution: { w: number; h: number } | null;
  codec: string | null;
  jitterMs: number | null;
  receivedBytes: number;
}

const EMPTY: StreamStats = {
  transport: null,
  bitrate: null,
  fps: null,
  loss: null,
  resolution: null,
  codec: null,
  jitterMs: null,
  receivedBytes: 0,
};

/**
 * Polls the active transport once per second and exposes streaming stats.
 * Handles both WebRTC (via pc.getStats()) and MSE (via bytes delta + video quality).
 */
export function useStreamStats(
  transport: TransportHandle | null,
  videoEl: HTMLVideoElement | null
): StreamStats {
  const [stats, setStats] = useState<StreamStats>(EMPTY);
  const prevBytesRef = useRef(0);
  const prevFramesRef = useRef(0);
  const prevPacketsLostRef = useRef(0);
  const prevPacketsReceivedRef = useRef(0);

  useEffect(() => {
    if (!transport || !videoEl) {
      setStats(EMPTY);
      return;
    }

    prevBytesRef.current = transport.getBytesReceived();
    prevFramesRef.current = videoEl.getVideoPlaybackQuality?.().totalVideoFrames ?? 0;
    prevPacketsLostRef.current = 0;
    prevPacketsReceivedRef.current = 0;

    const tick = async () => {
      const bytes = transport.getBytesReceived();
      const bitrate = Math.max(0, (bytes - prevBytesRef.current) * 8);
      prevBytesRef.current = bytes;

      const quality = videoEl.getVideoPlaybackQuality?.();
      const totalFrames = quality?.totalVideoFrames ?? 0;
      const fps = Math.max(0, totalFrames - prevFramesRef.current);
      prevFramesRef.current = totalFrames;

      let loss: number | null = null;
      let jitterMs: number | null = null;
      let resolution = { w: videoEl.videoWidth, h: videoEl.videoHeight };
      let codec: string | null = transport.videoCodec;

      if (transport.kind === "webrtc" && transport.peerConnection) {
        try {
          const report = await transport.peerConnection.getStats();
          report.forEach((s) => {
            if (s.type === "inbound-rtp" && (s as RTCInboundRtpStreamStats).kind === "video") {
              const r = s as RTCInboundRtpStreamStats;
              const packetsReceived = r.packetsReceived ?? 0;
              const packetsLost = r.packetsLost ?? 0;
              const deltaLost = packetsLost - prevPacketsLostRef.current;
              const deltaRcv = packetsReceived - prevPacketsReceivedRef.current;
              const totalDelta = deltaLost + deltaRcv;
              loss = totalDelta > 0 ? (deltaLost / totalDelta) * 100 : 0;
              prevPacketsLostRef.current = packetsLost;
              prevPacketsReceivedRef.current = packetsReceived;
              if (typeof r.jitter === "number") jitterMs = r.jitter * 1000;
              if (typeof r.frameWidth === "number" && typeof r.frameHeight === "number") {
                resolution = { w: r.frameWidth, h: r.frameHeight };
              }
              const codecId = (r as unknown as { codecId?: string }).codecId;
              if (codecId) {
                const codecReport = report.get(codecId) as unknown as { mimeType?: string } | undefined;
                if (codecReport?.mimeType) codec = codecReport.mimeType;
              }
            }
          });
        } catch {}
      }

      setStats({
        transport: transport.kind,
        bitrate: bitrate > 0 ? bitrate : null,
        fps: fps > 0 ? fps : null,
        loss,
        resolution: resolution.w > 0 ? resolution : null,
        codec,
        jitterMs,
        receivedBytes: bytes,
      });
    };

    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [transport, videoEl]);

  return stats;
}
