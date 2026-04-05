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
  // The first chunk emitted by bufferRecorder carries the EBML/Segment/Tracks
  // header. We keep it forever so replays can prepend a valid WebM header to
  // the otherwise headerless cluster data stored in the ring buffer.
  const headerChunkRef = useRef<Blob | null>(null);
  // Active future collectors: after the user clicks replay, we register one
  // of these to capture the next 10 seconds of chunks from the same running
  // bufferRecorder (no second MediaRecorder — that would produce an
  // incompatible stream with a different segment UID).
  const futureCollectorsRef = useRef<
    Array<{ chunks: Blob[]; until: number; resolve: (chunks: Blob[]) => void }>
  >([]);

  // Keep the latest measured bitrate in a ref so the buffer recorder effect
  // does not re-run every second as stats update. The recorder uses the value
  // captured at its init time.
  const measuredBitrateRef = useRef<number | null>(measuredBitrate);
  useEffect(() => {
    measuredBitrateRef.current = measuredBitrate;
  }, [measuredBitrate]);

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
        const bitrate = resolveBitrate(bitrateSetting, measuredBitrateRef.current);
        recorder = new MediaRecorder(stream, {
          mimeType: mimeType.mimeType,
          videoBitsPerSecond: bitrate,
        });
      } catch (e) {
        console.error("Buffer recorder init failed:", e);
        return;
      }

      recorder.ondataavailable = (ev) => {
        if (!ev.data || ev.data.size === 0) return;
        // First chunk contains the WebM header (EBML + Segment info + Tracks).
        // Store it separately so replays can prepend a valid header.
        if (headerChunkRef.current === null) {
          headerChunkRef.current = ev.data;
        }
        bufferRef.current.push({ blob: ev.data, timestamp: Date.now() });
        // Feed any active future collectors (used by takeReplay).
        if (futureCollectorsRef.current.length > 0) {
          const now = Date.now();
          futureCollectorsRef.current = futureCollectorsRef.current.filter((c) => {
            c.chunks.push(ev.data);
            if (now >= c.until) {
              c.resolve(c.chunks);
              return false;
            }
            return true;
          });
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
      headerChunkRef.current = null;
      // Resolve any pending future collectors with whatever they gathered —
      // the recorder is going away, they cannot get more data.
      for (const c of futureCollectorsRef.current) c.resolve(c.chunks);
      futureCollectorsRef.current = [];
    };
    // measuredBitrate intentionally excluded — it updates every second from stats
    // and would reset the ring buffer, defeating the purpose of instant replay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoEl, transportReady, mimeType, bitrateSetting]);

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
    if (!mimeType || !bufferRecorderRef.current) return;
    if (replayState === "capturing") return;

    setReplayState("capturing");

    // Snapshot past chunks from the ring buffer (up to last 10 seconds).
    const pastSnapshot = bufferRef.current.snapshot().map((i) => i.blob);

    // Register a future collector that will be fed by the same bufferRecorder
    // for the next 10 seconds. Using the same recorder guarantees all chunks
    // share one EBML Segment UID, so concatenation produces a valid WebM.
    const futureChunks = await new Promise<Blob[]>((resolve) => {
      futureCollectorsRef.current.push({
        chunks: [],
        until: Date.now() + 10_000,
        resolve,
      });
    });

    setReplayState("idle");

    // Prepend the header chunk (EBML + Segment info + Tracks) captured at
    // bufferRecorder start. Without this the past+future cluster data is
    // headerless and players reject everything before the next header.
    const parts: Blob[] = [];
    if (headerChunkRef.current) {
      parts.push(headerChunkRef.current);
      // The header chunk is itself already in the ring buffer snapshot if the
      // recorder has been running for less than RING_RETENTION_MS. Dedupe by
      // object identity to avoid writing it twice.
      for (const b of pastSnapshot) {
        if (b !== headerChunkRef.current) parts.push(b);
      }
    } else {
      parts.push(...pastSnapshot);
    }
    parts.push(...futureChunks);

    const combined = new Blob(parts, { type: mimeType.mimeType });
    const filename = buildFilename(cameraName, mimeType.ext);
    await downloadBlob(combined, filename);
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
    // replay capture will resolve naturally via the bufferRecorder cleanup
    // (which flushes futureCollectorsRef).
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
    replayState,
    takeReplay,
    isRecording,
    recordingSeconds,
    startRecording,
    stopRecording,
  };
}
