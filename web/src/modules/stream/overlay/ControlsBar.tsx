// web/src/modules/stream/overlay/ControlsBar.tsx
import { useToast } from "@/shared/toast/useToast";
import type { ScreenshotApi } from "../hooks/useScreenshot";

interface ControlsBarProps {
  screenshot: ScreenshotApi;
  // Record/replay props will come in later tasks.
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
      className={`w-10 h-10 flex items-center justify-center rounded bg-black/60 hover:bg-black/80 text-white disabled:opacity-40 disabled:cursor-not-allowed transition pointer-events-auto ${className}`}
    >
      {children}
    </button>
  );
}

export function ControlsBar({ screenshot }: ControlsBarProps) {
  const toast = useToast();

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

  return (
    <div className="absolute left-2 bottom-2 flex gap-2">
      <IconButton onClick={onScreenshot} disabled={!screenshot.isReady} title="Скриншот">
        {/* Camera icon */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      </IconButton>
      {screenshot.canCopy && (
        <IconButton onClick={onCopy} disabled={!screenshot.isReady} title="Скопировать кадр в буфер обмена">
          {/* Clipboard icon */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="2" width="6" height="4" rx="1" />
            <path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3" />
          </svg>
        </IconButton>
      )}
    </div>
  );
}
