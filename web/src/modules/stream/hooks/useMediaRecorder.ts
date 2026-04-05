// web/src/modules/stream/hooks/useMediaRecorder.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { pickRecordingMimeType, type RecordingMimeType } from "../lib/mimeType";
import { buildFilename } from "../lib/filename";
import { downloadBlob, openWritableStream } from "../lib/fileSaver";

// Instant replay strategy: run N overlapping MediaRecorders staggered by
// REPLAY_ROTATION_MS. At any moment, the oldest slot has been running for
// (N-1)*K..N*K seconds and therefore contains at least (N-1)*K seconds of
// past media. On a replay click we reserve that slot, let it run for another
// REPLAY_POST_MS seconds, call .stop() to flush a self-contained file, and
// hand the user a single coherent video without any cluster splicing.
// Slot count is user-configurable (2/3/4); more slots = longer past media
// at the cost of more concurrent encoders. Desktop-only; mobile disables
// replay entirely to save battery.
export const REPLAY_SLOT_COUNT_DEFAULT = 2;
export type ReplaySlotCount = 2 | 3 | 4;
const REPLAY_ROTATION_MS = 10_000;
const REPLAY_POST_MS = 10_000;
const MIN_BITRATE = 1_000_000;
const MAX_BITRATE = 10_000_000;
const DEFAULT_BITRATE = 4_000_000;

export type BitrateSetting = "auto" | 2_000_000 | 4_000_000 | 8_000_000;
export type ReplayState = "idle" | "capturing";

export interface MediaRecorderApi {
  supported: boolean;
  mimeType: RecordingMimeType | null;
  /** True when instant replay is available (desktop only). */
  replayAvailable: boolean;
  replayState: ReplayState;
  takeReplay(): Promise<void>;
  isRecording: boolean;
  recordingSeconds: number;
  startRecording(): Promise<void>;
  stopRecording(): Promise<void>;
}

function resolveBitrate(setting: BitrateSetting, measuredBitrate: number | null): number {
  if (setting !== "auto") return setting;
  if (measuredBitrate === null || measuredBitrate <= 0) return DEFAULT_BITRATE;
  return Math.max(MIN_BITRATE, Math.min(MAX_BITRATE, measuredBitrate));
}

export function useMediaRecorder(
  videoEl: HTMLVideoElement | null,
  transportReady: boolean,
  cameraName: string,
  measuredBitrate: number | null,
  bitrateSetting: BitrateSetting,
  replayEnabled: boolean,
  replaySlotCount: ReplaySlotCount
): MediaRecorderApi {
  const mimeTypeRef = useRef<RecordingMimeType | null>(null);
  if (mimeTypeRef.current === null) mimeTypeRef.current = pickRecordingMimeType();
  const mimeType = mimeTypeRef.current;

  // Rolling pair of overlapping recorders. Each slot holds one running
  // MediaRecorder and the chunks it has emitted since .start(). When .stop()
  // fires onstop, the chunks array is a complete self-contained WebM.
  interface ReplaySlot {
    recorder: MediaRecorder;
    chunks: Blob[];
    startedAt: number;
    reserved: boolean; // true while takeReplay is draining this slot
  }
  const replaySlotsRef = useRef<ReplaySlot[]>([]);
  const rotationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep the latest measured bitrate in a ref so the buffer recorder effect
  // does not re-run every second as stats update. The recorder uses the value
  // captured at its init time.
  const measuredBitrateRef = useRef<number | null>(measuredBitrate);
  useEffect(() => {
    measuredBitrateRef.current = measuredBitrate;
  }, [measuredBitrate]);

  // Replay recorder lifecycle: run REPLAY_SLOT_COUNT overlapping recorders
  // while transport is ready and replay is enabled (desktop only), rotating
  // one every REPLAY_ROTATION_MS so the oldest non-reserved slot always has
  // at least (N-1)*REPLAY_ROTATION_MS of past media.
  useEffect(() => {
    if (!videoEl || !transportReady || !mimeType || !replayEnabled) return;

    let cancelled = false;

    const startSlot = (): ReplaySlot | null => {
      const stream = (videoEl as HTMLVideoElement & { captureStream(): MediaStream }).captureStream();
      if (stream.getVideoTracks().length === 0) return null;

      let recorder: MediaRecorder;
      try {
        const bitrate = resolveBitrate(bitrateSetting, measuredBitrateRef.current);
        recorder = new MediaRecorder(stream, {
          mimeType: mimeType.mimeType,
          videoBitsPerSecond: bitrate,
        });
      } catch (e) {
        console.error("Replay recorder init failed:", e);
        return null;
      }

      const slot: ReplaySlot = {
        recorder,
        chunks: [],
        startedAt: Date.now(),
        reserved: false,
      };

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) slot.chunks.push(ev.data);
      };

      try {
        // No timeslice — emit data only on .stop(), so chunks reconstruct as
        // a single clean WebM finalized by the recorder itself.
        recorder.start();
      } catch (e) {
        console.error("Replay recorder start failed:", e);
        return null;
      }

      return slot;
    };

    const rotate = () => {
      if (cancelled) return;
      const slot = startSlot();
      if (!slot) return;
      replaySlotsRef.current.push(slot);
      // Keep exactly replaySlotCount non-reserved slots; retire the oldest
      // excess ones. Reserved slots (in-flight takeReplay) are untouched.
      const nonReserved = replaySlotsRef.current
        .filter((s) => !s.reserved)
        .sort((a, b) => a.startedAt - b.startedAt);
      const excess = Math.max(0, nonReserved.length - replaySlotCount);
      const toRetire = new Set(nonReserved.slice(0, excess));
      replaySlotsRef.current = replaySlotsRef.current.filter((s) => {
        if (toRetire.has(s)) {
          try {
            if (s.recorder.state !== "inactive") s.recorder.stop();
          } catch {}
          return false;
        }
        return true;
      });
    };

    const bootstrap = () => {
      if (cancelled) return;
      const stream = (videoEl as HTMLVideoElement & { captureStream(): MediaStream }).captureStream();
      if (stream.getVideoTracks().length === 0) {
        setTimeout(bootstrap, 200);
        return;
      }
      rotate();
      rotationTimerRef.current = setInterval(rotate, REPLAY_ROTATION_MS);
    };

    if (videoEl.readyState >= 2) {
      bootstrap();
    } else {
      const onLoaded = () => {
        videoEl.removeEventListener("loadeddata", onLoaded);
        bootstrap();
      };
      videoEl.addEventListener("loadeddata", onLoaded);
    }

    return () => {
      cancelled = true;
      if (rotationTimerRef.current) {
        clearInterval(rotationTimerRef.current);
        rotationTimerRef.current = null;
      }
      for (const s of replaySlotsRef.current) {
        if (s.reserved) continue; // let takeReplay finish its own stop flow
        try {
          if (s.recorder.state !== "inactive") s.recorder.stop();
        } catch {}
      }
      replaySlotsRef.current = replaySlotsRef.current.filter((s) => s.reserved);
    };
    // measuredBitrate intentionally excluded — it updates every second from
    // stats and would tear down the replay slots on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoEl, transportReady, mimeType, bitrateSetting, replayEnabled, replaySlotCount]);

  const [replayState, setReplayState] = useState<ReplayState>("idle");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const activeRecorderRef = useRef<MediaRecorder | null>(null);
  const activeChunksRef = useRef<Blob[]>([]);
  const activeWritableRef = useRef<Awaited<ReturnType<typeof openWritableStream>>>(null);
  const activeFilenameRef = useRef<string>("");
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const warnedAtNineRef = useRef(false);

  const finalizeActiveRecording = useCallback(
    async (_auto: boolean) => {
      const recorder = activeRecorderRef.current;
      if (!recorder) return;
      try {
        if (recorder.state !== "inactive") {
          await new Promise<void>((resolve) => {
            recorder.onstop = () => resolve();
            try {
              recorder.stop();
            } catch {
              resolve();
            }
          });
        }
      } catch {}

      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }

      const secondsAtStop = recordingSeconds;
      const writable = activeWritableRef.current;
      const chunks = activeChunksRef.current;
      const filename = activeFilenameRef.current;

      activeRecorderRef.current = null;
      activeChunksRef.current = [];
      activeWritableRef.current = null;
      activeFilenameRef.current = "";
      warnedAtNineRef.current = false;
      setIsRecording(false);
      setRecordingSeconds(0);

      if (writable) {
        try {
          await writable.close();
        } catch {}
        return;
      }

      if (secondsAtStop < 1 || chunks.length === 0) return;
      const combined = new Blob(chunks, { type: mimeType?.mimeType ?? "video/webm" });
      await downloadBlob(combined, filename);
    },
    [mimeType, recordingSeconds]
  );

  const takeReplay = useCallback(async () => {
    if (!mimeType) return;
    if (replayState === "capturing") return;

    // Pick the oldest non-reserved slot — it has the most past media.
    const candidate = replaySlotsRef.current
      .filter((s) => !s.reserved && s.recorder.state === "recording")
      .sort((a, b) => a.startedAt - b.startedAt)[0];
    if (!candidate) return;

    candidate.reserved = true;
    setReplayState("capturing");

    try {
      // Let the reserved slot keep recording for REPLAY_POST_MS more seconds
      // so it captures the "future" portion. Other slots continue rotating as
      // usual in the background.
      await new Promise((r) => setTimeout(r, REPLAY_POST_MS));

      // Stop it and wait for the final ondataavailable + onstop. The resulting
      // chunks array is a complete self-contained WebM covering
      // [candidate.startedAt, candidate.startedAt + age + REPLAY_POST_MS].
      await new Promise<void>((resolve) => {
        const recorder = candidate.recorder;
        const done = () => resolve();
        recorder.onstop = done;
        try {
          if (recorder.state !== "inactive") recorder.stop();
          else done();
        } catch {
          done();
        }
      });

      // Remove the reserved slot from the active list.
      replaySlotsRef.current = replaySlotsRef.current.filter((s) => s !== candidate);

      if (candidate.chunks.length === 0) return;
      const combined = new Blob(candidate.chunks, { type: mimeType.mimeType });
      const filename = buildFilename(cameraName, mimeType.ext);
      await downloadBlob(combined, filename);
    } finally {
      setReplayState("idle");
    }
  }, [mimeType, cameraName, replayState]);
  const startRecording = useCallback(async () => {
    if (!videoEl || !mimeType || activeRecorderRef.current) return;
    if (!transportReady) return;

    const filename = buildFilename(cameraName, mimeType.ext);
    activeFilenameRef.current = filename;

    // Try File System Access API first.
    const writable = await openWritableStream(filename);
    if (writable === null && typeof window.showSaveFilePicker === "function") {
      // User cancelled the native dialog — abort silently.
      activeFilenameRef.current = "";
      return;
    }
    activeWritableRef.current = writable;

    const stream = (videoEl as HTMLVideoElement & { captureStream(): MediaStream }).captureStream();
    const bitrate = resolveBitrate(bitrateSetting, measuredBitrate);
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, {
        mimeType: mimeType.mimeType,
        videoBitsPerSecond: bitrate,
      });
    } catch (e) {
      console.error("Active recorder init failed:", e);
      if (writable) await writable.close().catch(() => {});
      activeWritableRef.current = null;
      activeFilenameRef.current = "";
      throw e;
    }

    recorder.ondataavailable = async (ev) => {
      if (!ev.data || ev.data.size === 0) return;
      if (activeWritableRef.current) {
        try {
          await activeWritableRef.current.write(ev.data);
        } catch (e) {
          console.error("writable.write failed:", e);
        }
      } else {
        activeChunksRef.current.push(ev.data);
      }
    };

    try {
      recorder.start(1000);
    } catch (e) {
      if (writable) await writable.close().catch(() => {});
      activeWritableRef.current = null;
      activeFilenameRef.current = "";
      throw e;
    }

    activeRecorderRef.current = recorder;
    setIsRecording(true);
    setRecordingSeconds(0);
    warnedAtNineRef.current = false;

    recordingTimerRef.current = setInterval(() => {
      setRecordingSeconds((s) => {
        const next = s + 1;
        if (next === 540 && !warnedAtNineRef.current) {
          warnedAtNineRef.current = true;
          window.dispatchEvent(new CustomEvent("recording-warning-9min"));
        }
        if (next >= 600) {
          queueMicrotask(() => finalizeActiveRecording(true));
        }
        return next;
      });
    }, 1000);
  }, [videoEl, transportReady, mimeType, cameraName, bitrateSetting, measuredBitrate, finalizeActiveRecording]);
  const stopRecording = useCallback(async () => {
    await finalizeActiveRecording(false);
  }, [finalizeActiveRecording]);

  useEffect(() => {
    if (transportReady) return;
    // Transport just went away. Finalize active recording; any in-flight
    // replay capture will finish on its own setTimeout.
    if (activeRecorderRef.current) {
      finalizeActiveRecording(true).catch(() => {});
    }
  }, [transportReady, finalizeActiveRecording]);

  useEffect(() => {
    return () => {
      if (activeRecorderRef.current) {
        try {
          activeRecorderRef.current.stop();
        } catch {}
        activeRecorderRef.current = null;
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    };
  }, []);

  return {
    supported: mimeType !== null,
    mimeType,
    replayAvailable: replayEnabled && mimeType !== null,
    replayState,
    takeReplay,
    isRecording,
    recordingSeconds,
    startRecording,
    stopRecording,
  };
}
