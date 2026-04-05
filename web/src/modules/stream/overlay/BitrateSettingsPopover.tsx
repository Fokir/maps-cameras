// web/src/modules/stream/overlay/BitrateSettingsPopover.tsx
import { useEffect, useRef, useState } from "react";
import type { BitrateSetting } from "../hooks/useMediaRecorder";

const STORAGE_KEY = "maps-cameras.recordingBitrate";

const options: { value: BitrateSetting; label: string }[] = [
  { value: "auto", label: "Авто (рекомендуется)" },
  { value: 2_000_000, label: "2 Mbps — низкое" },
  { value: 4_000_000, label: "4 Mbps — среднее" },
  { value: 8_000_000, label: "8 Mbps — высокое" },
];

export function loadBitrateSetting(): BitrateSetting {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "2000000" || stored === "4000000" || stored === "8000000") {
    return Number(stored) as BitrateSetting;
  }
  return "auto";
}

export function BitrateSettingsPopover({
  value,
  onChange,
}: {
  value: BitrateSetting;
  onChange: (v: BitrateSetting) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const handleChange = (v: BitrateSetting) => {
    onChange(v);
    if (v === "auto") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(v));
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="absolute right-2 top-2 z-10">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Настройки записи"
        className="w-9 h-9 flex items-center justify-center rounded bg-black/60 hover:bg-black/80 text-white pointer-events-auto"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-60 bg-gray-900 text-white rounded shadow-lg p-3 text-sm pointer-events-auto">
          <div className="text-xs text-gray-400 mb-2">Битрейт записи</div>
          {options.map((opt) => (
            <label key={String(opt.value)} className="flex items-center gap-2 py-1 cursor-pointer">
              <input
                type="radio"
                name="bitrate"
                checked={value === opt.value}
                onChange={() => handleChange(opt.value)}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
