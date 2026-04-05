// web/src/modules/stream/StreamPlayer.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { useStreamStore } from "./streamStore";
import { useTransportRace } from "./transports/useTransportRace";
import { useStreamStats } from "./hooks/useStreamStats";
import { StatsWidget } from "./overlay/StatsWidget";
import { ControlsBar } from "./overlay/ControlsBar";
import { BitrateSettingsPopover, loadBitrateSetting } from "./overlay/BitrateSettingsPopover";
import { useScreenshot } from "./hooks/useScreenshot";
import { useMediaRecorder, type BitrateSetting } from "./hooks/useMediaRecorder";
import { useCameraStore } from "@/modules/camera/cameraStore";

export function StreamPlayer({ compact = false }: { compact?: boolean } = {}) {
  const streamInfo = useStreamStore((s) => s.streamInfo);
  const loading = useStreamStore((s) => s.loading);
  const error = useStreamStore((s) => s.error);

  const activeCameraId = useStreamStore((s) => s.activeCameraId);
  const cameras = useCameraStore((s) => s.cameras);
  const cameraName = cameras.find((c) => c.id === activeCameraId)?.name ?? "camera";

  const [bitrateSetting, setBitrateSetting] = useState<BitrateSetting>(loadBitrateSetting);

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
  const screenshot = useScreenshot(videoEl, cameraName);
  const recorder = useMediaRecorder(
    videoEl,
    race.active !== null,
    cameraName,
    stats.bitrate,
    bitrateSetting
  );

  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
  }, []);

  useEffect(() => {
    showControls();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [showControls]);

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
    <div
      className="h-full bg-black flex items-center justify-center relative"
      onMouseMove={showControls}
      onTouchStart={showControls}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="max-h-full max-w-full"
      />
      {!compact && race.active && <StatsWidget stats={stats} />}
      {!compact && race.active && (
        <div
          className={`transition-opacity duration-300 ${
            controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <ControlsBar screenshot={screenshot} recorder={recorder} />
        </div>
      )}
      {!compact && race.active && (
        <BitrateSettingsPopover value={bitrateSetting} onChange={setBitrateSetting} />
      )}
      {race.phase === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-red-400 text-center p-4">
          Не удалось подключиться: {race.error}
        </div>
      )}
    </div>
  );
}
