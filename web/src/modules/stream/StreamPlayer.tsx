// web/src/modules/stream/StreamPlayer.tsx
import { useCallback, useState } from "react";
import { useStreamStore } from "./streamStore";
import { useTransportRace } from "./transports/useTransportRace";
import { useStreamStats } from "./hooks/useStreamStats";
import { StatsWidget } from "./overlay/StatsWidget";

export function StreamPlayer() {
  const streamInfo = useStreamStore((s) => s.streamInfo);
  const loading = useStreamStore((s) => s.loading);
  const error = useStreamStore((s) => s.error);

  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const videoRef = useCallback((el: HTMLVideoElement | null) => {
    setVideoEl(el);
  }, []);

  const wsUrl = streamInfo
    ? `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${streamInfo.ws_url}`
    : null;
  const webrtcUrl = streamInfo
    ? `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${streamInfo.webrtc_url}`
    : null;

  const race = useTransportRace(videoEl, wsUrl, webrtcUrl);
  const stats = useStreamStats(race.active, videoEl);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-950 text-gray-400">
        Подключение...
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-950 text-red-400">
        Ошибка: {error}
      </div>
    );
  }

  if (!streamInfo) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-950 text-gray-500">
        <div className="text-center">
          <div className="text-4xl mb-2">📹</div>
          <p>Выберите камеру на карте</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-black flex items-center justify-center relative">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="max-h-full max-w-full"
      />
      {race.active && <StatsWidget stats={stats} />}
      {race.phase === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-red-400 text-center p-4">
          Не удалось подключиться: {race.error}
        </div>
      )}
    </div>
  );
}
