// web/src/modules/stream/hooks/useMediaRecorder.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { pickRecordingMimeType, type RecordingMimeType } from "../lib/mimeType";
import { RingBuffer } from "../lib/ringBuffer";
import { buildFilename } from "../lib/filename";
import { downloadBlob, openWritableStream } from "../lib/fileSaver";

const RING_RETENTION_MS = 10_000;
const RING_CHUNK_MS = 500;
const MIN_BITRATE = 1_000_000;
const MAX_BITRATE = 10_000_000;
const DEFAULT_BITRATE = 4_000_000;

export type BitrateSetting = "auto" | 2_000_000 | 4_000_000 | 8_000_000;
export type ReplayState = "idle" | "capturing";

export interface MediaRecorderApi {
  supported: boolean;
  mimeType: RecordingMimeType | null;
  // Replay (added in later task)
  replayState: ReplayState;
  takeReplay(): Promise<void>;
  // Manual recording (added in later task)
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
  bitrateSetting: BitrateSetting
): MediaRecorderApi {
  const mimeTypeRef = useRef<RecordingMimeType | null>(null);
  if (mimeTypeRef.current === null) mimeTypeRef.current = pickRecordingMimeType();
  const mimeType = mimeTypeRef.current;

  const bufferRef = useRef<RingBuffer>(new RingBuffer(RING_RETENTION_MS));
  const bufferRecorderRef = useRef<MediaRecorder | null>(null);

  // Buffer recorder lifecycle: runs while transport is ready.
  useEffect(() => {
    if (!videoEl || !transportReady || !mimeType) return;

    let recorder: MediaRecorder | null = null;
    let cancelled = false;

    const initRecorder = () => {
      if (cancelled) return;
      // videoEl may not expose tracks yet even after loadeddata on some transports.
      const stream = (videoEl as HTMLVideoElement & { captureStream(): MediaStream }).captureStream();
      if (stream.getVideoTracks().length === 0) {
        // No tracks yet — schedule a short retry. loadeddata may fire before tracks
        // are actually exposed via captureStream in some browsers.
        setTimeout(initRecorder, 200);
        return;
      }

      try {
        const bitrate = resolveBitrate(bitrateSetting, measuredBitrate);
        recorder = new MediaRecorder(stream, {
          mimeType: mimeType.mimeType,
          videoBitsPerSecond: bitrate,
        });
      } catch (e) {
        console.error("Buffer recorder init failed:", e);
        return;
      }

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          bufferRef.current.push({ blob: ev.data, timestamp: Date.now() });
        }
      };

      try {
        recorder.start(RING_CHUNK_MS);
        bufferRecorderRef.current = recorder;
      } catch (e) {
        console.error("Buffer recorder start failed:", e);
        recorder = null;
        return;
      }
    };

    if (videoEl.readyState >= 2) {
      initRecorder();
    } else {
      const onLoaded = () => {
        videoEl.removeEventListener("loadeddata", onLoaded);
        initRecorder();
      };
      videoEl.addEventListener("loadeddata", onLoaded);
    }

    return () => {
      cancelled = true;
      try {
        if (recorder && recorder.state !== "inactive") recorder.stop();
      } catch {}
      bufferRecorderRef.current = null;
      bufferRef.current.clear();
    };
  }, [videoEl, transportReady, mimeType, measuredBitrate, bitrateSetting]);

  // Placeholder APIs — implemented in next tasks.
  const [replayState, setReplayState] = useState<ReplayState>("idle");
  const replayRecorderRef = useRef<MediaRecorder | null>(null);
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
    if (!videoEl || !mimeType || replayRecorderRef.current) return;
    if (!transportReady) return;

    setReplayState("capturing");

    const pastSnapshot = bufferRef.current.snapshot().map((i) => i.blob);
    const stream = (videoEl as HTMLVideoElement & { captureStream(): MediaStream }).captureStream();
    const bitrate = resolveBitrate(bitrateSetting, measuredBitrate);

    const futureChunks: Blob[] = [];
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, {
        mimeType: mimeType.mimeType,
        videoBitsPerSecond: bitrate,
      });
    } catch (e) {
      console.error("Replay recorder init failed:", e);
      setReplayState("idle");
      throw e;
    }

    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) futureChunks.push(ev.data);
    };

    const finish = (): Promise<Blob> =>
      new Promise((resolve) => {
        recorder.onstop = () => {
          const combined = new Blob([...pastSnapshot, ...futureChunks], {
            type: mimeType.mimeType,
          });
          resolve(combined);
        };
        try {
          recorder.stop();
        } catch {
          resolve(new Blob([...pastSnapshot, ...futureChunks], { type: mimeType.mimeType }));
        }
      });

    replayRecorderRef.current = recorder;
    try {
      recorder.start(500);
    } catch (e) {
      console.error("Replay recorder start failed:", e);
      replayRecorderRef.current = null;
      setReplayState("idle");
      throw e;
    }

    await new Promise((r) => setTimeout(r, 10_000));
    const blob = await finish();
    replayRecorderRef.current = null;
    setReplayState("idle");

    const filename = buildFilename(cameraName, mimeType.ext);
    await downloadBlob(blob, filename);
  }, [videoEl, transportReady, mimeType, measuredBitrate, bitrateSetting, cameraName]);
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
    return () => {
      if (replayRecorderRef.current) {
        try {
          replayRecorderRef.current.stop();
        } catch {}
        replayRecorderRef.current = null;
      }
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
    replayState,
    takeReplay,
    isRecording,
    recordingSeconds,
    startRecording,
    stopRecording,
  };
}
