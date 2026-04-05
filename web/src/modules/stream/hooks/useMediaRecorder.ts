// web/src/modules/stream/hooks/useMediaRecorder.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { pickRecordingMimeType, type RecordingMimeType } from "../lib/mimeType";
import { RingBuffer } from "../lib/ringBuffer";

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
  _cameraName: string,
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

    let recorder: MediaRecorder;
    try {
      const stream = (videoEl as HTMLVideoElement & { captureStream(): MediaStream }).captureStream();
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
      return;
    }

    return () => {
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch {}
      bufferRecorderRef.current = null;
      bufferRef.current.clear();
    };
  }, [videoEl, transportReady, mimeType, measuredBitrate, bitrateSetting]);

  // Placeholder APIs — implemented in next tasks.
  const [replayState] = useState<ReplayState>("idle");
  const [isRecording] = useState(false);
  const [recordingSeconds] = useState(0);

  const takeReplay = useCallback(async () => {
    // Implemented in Task 17.
  }, []);
  const startRecording = useCallback(async () => {
    // Implemented in Task 18.
  }, []);
  const stopRecording = useCallback(async () => {
    // Implemented in Task 18.
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
