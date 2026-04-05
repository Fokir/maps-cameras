// web/src/modules/stream/transports/useMseTransport.ts
import { useEffect } from "react";
import type { TransportCallbacks, TransportHandle } from "./types";

// go2rtc expects an exact set of codec tokens. It parses them literally.
// See pkg/mp4/mime.go in AlexxIT/go2rtc.
const CANDIDATE_CODECS = [
  "avc1.640029",
  "avc1.64002A",
  "avc1.640033",
  "hvc1.1.6.L153.B0",
  "mp4a.40.2",
  "mp4a.40.5",
  "flac",
  "opus",
];

/**
 * MSE (MediaSource Extensions) transport. Opens a WebSocket to go2rtc's
 * MSE endpoint, negotiates supported codecs, and feeds incoming fMP4 chunks
 * into a SourceBuffer attached to the provided <video> element.
 *
 * Calls onReady once the first chunk has been appended and the video is ready
 * to play. Calls onError if the WebSocket fails or the codec is rejected.
 */
export function useMseTransport(
  videoEl: HTMLVideoElement | null,
  wsUrl: string | null,
  callbacks: TransportCallbacks
): void {
  useEffect(() => {
    if (!videoEl || !wsUrl) return;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";

    let disposed = false;
    let bytesReceived = 0;
    let mediaSource: MediaSource | null = null;
    let sourceBuffer: SourceBuffer | null = null;
    let videoCodec: string | null = null;
    let readyFired = false;
    const queue: ArrayBuffer[] = [];

    const handle: TransportHandle = {
      kind: "mse",
      getBytesReceived: () => bytesReceived,
      get videoCodec() {
        return videoCodec;
      },
      dispose: () => {
        if (disposed) return;
        disposed = true;
        try {
          ws.close();
        } catch {}
        if (mediaSource && mediaSource.readyState === "open") {
          try {
            mediaSource.endOfStream();
          } catch {}
        }
        try {
          videoEl.src = "";
        } catch {}
      },
    };

    const appendNext = () => {
      if (!sourceBuffer || sourceBuffer.updating) return;
      const buf = queue.shift();
      if (buf) {
        try {
          sourceBuffer.appendBuffer(buf);
        } catch (e) {
          console.error("appendBuffer failed:", e);
        }
      }
    };

    ws.onopen = () => {
      const supported = CANDIDATE_CODECS.filter((c) =>
        MediaSource.isTypeSupported(`video/mp4; codecs="${c}"`)
      );
      ws.send(JSON.stringify({ type: "mse", value: supported.join(",") }));
    };

    ws.onmessage = (event) => {
      if (disposed) return;
      if (typeof event.data === "string") {
        const msg = JSON.parse(event.data);
        if (msg.type === "mse") {
          videoCodec = msg.value;
          mediaSource = new MediaSource();
          videoEl.src = URL.createObjectURL(mediaSource);
          mediaSource.addEventListener("sourceopen", () => {
            try {
              sourceBuffer = mediaSource!.addSourceBuffer(msg.value);
              sourceBuffer.mode = "segments";
              sourceBuffer.addEventListener("updateend", appendNext);
              appendNext();
            } catch (e) {
              console.error("MSE codec not supported:", msg.value, e);
              callbacks.onError(new Error("MSE codec rejected: " + String(e)));
            }
          });
          videoEl.play().catch(() => {});
        } else if (msg.type === "error") {
          console.error("go2rtc error:", msg.value);
          callbacks.onError(new Error("go2rtc error: " + msg.value));
        }
      } else if (event.data instanceof ArrayBuffer) {
        bytesReceived += event.data.byteLength;
        if (sourceBuffer && !sourceBuffer.updating && queue.length === 0) {
          try {
            sourceBuffer.appendBuffer(event.data);
          } catch {
            queue.push(event.data);
          }
        } else {
          queue.push(event.data);
        }
        if (!readyFired && bytesReceived > 0) {
          readyFired = true;
          // Defer so onReady fires after the microtask queue, giving videoEl a chance to progress.
          queueMicrotask(() => {
            if (!disposed) callbacks.onReady(handle);
          });
        }
      }
    };

    ws.onerror = (e) => {
      console.error("MSE WebSocket error:", e);
    };

    ws.onclose = (e) => {
      if (disposed) return;
      if (!readyFired) {
        callbacks.onError(new Error(`MSE closed before ready (${e.code})`));
      }
    };

    return () => {
      handle.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoEl, wsUrl]);
}
