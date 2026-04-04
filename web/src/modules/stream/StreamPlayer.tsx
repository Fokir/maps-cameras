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

    let mediaSource: MediaSource | null = null;
    let sourceBuffer: SourceBuffer | null = null;
    const queue: ArrayBuffer[] = [];

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "mse" }));
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
              sourceBuffer.addEventListener("updateend", () => {
                if (queue.length > 0 && sourceBuffer && !sourceBuffer.updating) {
                  sourceBuffer.appendBuffer(queue.shift()!);
                }
              });
            } catch (e) {
              console.error("MSE codec not supported:", e);
            }
          });
          video.play().catch(() => {});
        }
      } else if (event.data instanceof Blob) {
        event.data.arrayBuffer().then((buf) => {
          if (sourceBuffer && !sourceBuffer.updating) {
            sourceBuffer.appendBuffer(buf);
          } else {
            queue.push(buf);
          }
        });
      }
    };

    ws.onerror = () => {
      console.error("WebSocket error, stream may not be available");
    };

    return () => {
      ws.close();
      if (mediaSource && mediaSource.readyState === "open") {
        mediaSource.endOfStream();
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
