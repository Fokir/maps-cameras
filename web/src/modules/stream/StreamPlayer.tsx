import { useEffect, useRef } from "react";
import { useStreamStore } from "./streamStore";

export function StreamPlayer() {
  const streamInfo = useStreamStore((s) => s.streamInfo);
  const loading = useStreamStore((s) => s.loading);
  const error = useStreamStore((s) => s.error);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!streamInfo || !videoRef.current) return;

    const video = videoRef.current;
    const wsUrl = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${streamInfo.ws_url}`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";

    let mediaSource: MediaSource | null = null;
    let sourceBuffer: SourceBuffer | null = null;
    const queue: ArrayBuffer[] = [];

    // go2rtc expects an exact set of codec tokens. It parses them literally,
    // so only these strings trigger the right media selection.
    // See pkg/mp4/mime.go in AlexxIT/go2rtc.
    const candidateCodecs = [
      "avc1.640029",
      "avc1.64002A",
      "avc1.640033",
      "hvc1.1.6.L153.B0",
      "mp4a.40.2",
      "mp4a.40.5",
      "flac",
      "opus",
    ];

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
      const supported = candidateCodecs.filter((c) =>
        MediaSource.isTypeSupported(`video/mp4; codecs="${c}"`)
      );
      // go2rtc expects raw comma-joined codec tokens, NOT a full MIME string.
      const value = supported.join(",");
      console.log("Sending MSE codecs:", value);
      ws.send(JSON.stringify({ type: "mse", value }));
    };

    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        const msg = JSON.parse(event.data);
        if (msg.type === "mse") {
          mediaSource = new MediaSource();
          video.src = URL.createObjectURL(mediaSource);
          mediaSource.addEventListener("sourceopen", () => {
            try {
              sourceBuffer = mediaSource!.addSourceBuffer(msg.value);
              sourceBuffer.mode = "segments";
              sourceBuffer.addEventListener("updateend", appendNext);
              appendNext();
            } catch (e) {
              console.error("MSE codec not supported:", msg.value, e);
            }
          });
          video.play().catch(() => {});
        } else if (msg.type === "error") {
          console.error("go2rtc error:", msg.value);
        }
      } else if (event.data instanceof ArrayBuffer) {
        if (sourceBuffer && !sourceBuffer.updating && queue.length === 0) {
          try {
            sourceBuffer.appendBuffer(event.data);
          } catch (e) {
            queue.push(event.data);
          }
        } else {
          queue.push(event.data);
        }
      }
    };

    ws.onerror = (e) => {
      console.error("WebSocket error:", e);
    };

    ws.onclose = (e) => {
      console.log("WebSocket closed:", e.code, e.reason);
    };

    return () => {
      ws.close();
      if (mediaSource && mediaSource.readyState === "open") {
        try { mediaSource.endOfStream(); } catch {}
      }
      video.src = "";
    };
  }, [streamInfo]);

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
    <div className="h-full bg-black flex items-center justify-center">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="max-h-full max-w-full"
      />
    </div>
  );
}
