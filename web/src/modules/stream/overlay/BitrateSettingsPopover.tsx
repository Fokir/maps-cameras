// web/src/modules/stream/overlay/BitrateSettingsPopover.tsx
import { useEffect, useRef, useState } from "react";
import type { BitrateSetting, ReplaySlotCount } from "../hooks/useMediaRecorder";
import { REPLAY_SLOT_COUNT_DEFAULT } from "../hooks/useMediaRecorder";

const BITRATE_STORAGE_KEY = "maps-cameras.recordingBitrate";
const REPLAY_SLOTS_STORAGE_KEY = "maps-cameras.replaySlotCount";

const bitrateOptions: { value: BitrateSetting; label: string }[] = [
  { value: "auto", label: "Авто (рекомендуется)" },
  { value: 2_000_000, label: "2 Mbps — низкое" },
  { value: 4_000_000, label: "4 Mbps — среднее" },
  { value: 8_000_000, label: "8 Mbps — высокое" },
];

const slotOptions: { value: ReplaySlotCount; label: string }[] = [
  { value: 2, label: "2 слота — 20–30 с (рекомендуется)" },
  { value: 3, label: "3 слота — 30–40 с" },
  { value: 4, label: "4 слота — 40–50 с" },
];

export function loadBitrateSetting(): BitrateSetting {
  const stored = localStorage.getItem(BITRATE_STORAGE_KEY);
  if (stored === "2000000" || stored === "4000000" || stored === "8000000") {
    return Number(stored) as BitrateSetting;
  }
  return "auto";
}

export function loadReplaySlotCount(): ReplaySlotCount {
  const stored = localStorage.getItem(REPLAY_SLOTS_STORAGE_KEY);
  if (stored === "2" || stored === "3" || stored === "4") {
    return Number(stored) as ReplaySlotCount;
  }
  return REPLAY_SLOT_COUNT_DEFAULT as ReplaySlotCount;
}

export function BitrateSettingsPopover({
  bitrate,
  onBitrateChange,
  slotCount,
  onSlotCountChange,
  replayAvailable,
}: {
  bitrate: BitrateSetting;
  onBitrateChange: (v: BitrateSetting) => void;
  slotCount: ReplaySlotCount;
  onSlotCountChange: (v: ReplaySlotCount) => void;
  replayAvailable: boolean;
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

  const handleBitrateChange = (v: BitrateSetting) => {
    onBitrateChange(v);
    if (v === "auto") localStorage.removeItem(BITRATE_STORAGE_KEY);
    else localStorage.setItem(BITRATE_STORAGE_KEY, String(v));
  };

  const handleSlotChange = (v: ReplaySlotCount) => {
    onSlotCountChange(v);
    localStorage.setItem(REPLAY_SLOTS_STORAGE_KEY, String(v));
  };

  return (
    <div ref={rootRef} className="absolute right-2 top-2 z-10">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Настройки записи"
        className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-700/60 hover:bg-slate-600/60 text-white shadow-md shadow-black/30 ring-1 ring-white/15 hover:ring-white/25 backdrop-blur-sm active:scale-95 transition-all duration-150 pointer-events-auto"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-gray-900 text-white rounded-lg shadow-lg ring-1 ring-white/10 p-3 text-sm pointer-events-auto">
          <div className="text-xs text-gray-400 mb-2 uppercase tracking-wide">Битрейт записи</div>
          {bitrateOptions.map((opt) => (
            <label key={String(opt.value)} className="flex items-center gap-2 py-1 cursor-pointer">
              <input
                type="radio"
                name="bitrate"
                checked={bitrate === opt.value}
                onChange={() => handleBitrateChange(opt.value)}
              />
              <span>{opt.label}</span>
            </label>
          ))}

          {replayAvailable && (
            <>
              <div className="text-xs text-gray-400 mt-4 mb-2 uppercase tracking-wide">
                Буфер реплея
              </div>
              {slotOptions.map((opt) => (
                <label
                  key={String(opt.value)}
                  className="flex items-center gap-2 py-1 cursor-pointer"
                >
                  <input
                    type="radio"
                    name="replaySlots"
                    checked={slotCount === opt.value}
                    onChange={() => handleSlotChange(opt.value)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
              <div className="text-xs text-gray-500 mt-1">
                Больше слотов = больше прошлого в реплее, но больше нагрузка на CPU.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
