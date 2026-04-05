// web/src/modules/stream/overlay/ControlsBar.tsx
import { useEffect } from "react";
import { useToast } from "@/shared/toast/useToast";
import type { ScreenshotApi } from "../hooks/useScreenshot";
import type { MediaRecorderApi } from "../hooks/useMediaRecorder";
import { RecordingIndicator } from "./RecordingIndicator";

interface ControlsBarProps {
  screenshot: ScreenshotApi;
  recorder: MediaRecorderApi;
}

function IconButton({
  onClick,
  disabled,
  title,
  children,
  className = "",
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`min-w-10 h-10 px-2 flex items-center justify-center gap-1 rounded bg-black/60 hover:bg-black/80 text-white text-xs disabled:opacity-40 disabled:cursor-not-allowed transition pointer-events-auto ${className}`}
    >
      {children}
    </button>
  );
}

export function ControlsBar({ screenshot, recorder }: ControlsBarProps) {
  const toast = useToast();

  useEffect(() => {
    const onWarn = () => toast.warn("Запись остановится через 60 секунд");
    window.addEventListener("recording-warning-9min", onWarn);
    return () => window.removeEventListener("recording-warning-9min", onWarn);
  }, [toast]);

  const onScreenshot = async () => {
    try {
      await screenshot.saveToFile();
      toast.success("Скриншот сохранён");
    } catch (e) {
      toast.error("Не удалось создать скриншот: " + (e as Error).message);
    }
  };

  const onCopy = async () => {
    try {
      await screenshot.copyToClipboard();
      toast.success("Скопировано в буфер обмена");
    } catch (e) {
      toast.error("Не удалось скопировать: " + (e as Error).message);
    }
  };

  const onReplay = async () => {
    try {
      await recorder.takeReplay();
      toast.success("Реплей сохранён");
    } catch (e) {
      toast.error("Не удалось сохранить реплей: " + (e as Error).message);
    }
  };

  const onToggleRecord = async () => {
    try {
      if (recorder.isRecording) {
        await recorder.stopRecording();
        toast.success("Запись сохранена");
      } else {
        await recorder.startRecording();
      }
    } catch (e) {
      toast.error("Ошибка записи: " + (e as Error).message);
    }
  };

  return (
    <div className="absolute left-2 bottom-2 flex gap-2 items-center">
      <IconButton onClick={onScreenshot} disabled={!screenshot.isReady} title="Скриншот">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      </IconButton>

      {screenshot.canCopy && (
        <IconButton onClick={onCopy} disabled={!screenshot.isReady} title="Скопировать кадр в буфер обмена">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="2" width="6" height="4" rx="1" />
            <path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3" />
          </svg>
        </IconButton>
      )}

      {recorder.supported && (
        <>
          <IconButton
            onClick={onReplay}
            disabled={recorder.replayState === "capturing"}
            title="Сохранить реплей +/- 10 секунд"
            className="!bg-green-700/80 hover:!bg-green-600/80"
          >
            {recorder.replayState === "capturing" ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                <circle cx="12" cy="12" r="10" strokeDasharray="40 20" />
              </svg>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 22 4 11c0-3 2-5 5-5l3-4 2 4c3 0 5 2 5 5l-2 11z" />
                  <circle cx="10" cy="16" r="1" />
                  <circle cx="14" cy="16" r="1" />
                </svg>
                <span>Реплей</span>
              </>
            )}
          </IconButton>

          <IconButton
            onClick={onToggleRecord}
            disabled={!screenshot.isReady}
            title={recorder.isRecording ? "Остановить запись" : "Начать запись"}
            className={recorder.isRecording ? "!bg-red-700/80 hover:!bg-red-600/80" : "!bg-red-600/80 hover:!bg-red-500/80"}
          >
            {recorder.isRecording ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="5" y="5" width="14" height="14" rx="1" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="8" />
              </svg>
            )}
          </IconButton>

          {recorder.isRecording && <RecordingIndicator seconds={recorder.recordingSeconds} />}
        </>
      )}
    </div>
  );
}
