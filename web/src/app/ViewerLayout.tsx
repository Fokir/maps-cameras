import { useRef, useState, useCallback, useEffect } from "react";
import { MapView } from "@/modules/map/MapView";
import { CameraMarker } from "@/modules/map/CameraMarker";
import { StreamPlayer } from "@/modules/stream/StreamPlayer";
import { useCameraStore } from "@/modules/camera/cameraStore";
import { useStreamStore } from "@/modules/stream/streamStore";
import { useEditorStore } from "@/modules/editor/editorStore";
import { useMediaQuery } from "@/shared/hooks";

export function ViewerLayout() {
  const cameras = useCameraStore((s) => s.cameras);
  const selectedId = useCameraStore((s) => s.selectedId);
  const selectCamera = useCameraStore((s) => s.selectCamera);
  const startStream = useStreamStore((s) => s.startStream);
  const stopStream = useStreamStore((s) => s.stopStream);
  const activeCameraId = useStreamStore((s) => s.activeCameraId);
  const setMode = useEditorStore((s) => s.setMode);
  const isMobile = useMediaQuery("(max-width: 768px)");

  const [splitPercent, setSplitPercent] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const handleCameraClick = useCallback(
    (id: string) => {
      selectCamera(id);
      startStream(id);
    },
    [selectCamera, startStream]
  );

  const handleMouseDown = useCallback(() => {
    dragging.current = true;
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const percent = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPercent(Math.max(20, Math.min(80, percent)));
    };
    const handleMouseUp = () => {
      dragging.current = false;
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  // Mobile: show stream fullscreen
  if (isMobile && activeCameraId) {
    return (
      <div className="h-full relative">
        <StreamPlayer />
        <button
          onClick={() => {
            stopStream();
            selectCamera(null);
          }}
          className="absolute top-3 left-3 z-10 bg-gray-800/80 text-white px-3 py-1.5 rounded"
        >
          ← Карта
        </button>
      </div>
    );
  }

  // Mobile: map only
  if (isMobile) {
    return (
      <div className="h-full relative">
        <MapView>
          {cameras
            .filter((c) => c.lat != null)
            .map((c) => (
              <CameraMarker
                key={c.id}
                camera={c}
                isActive={c.id === selectedId}
                onClick={handleCameraClick}
              />
            ))}
        </MapView>
        <button
          onClick={() => setMode("edit")}
          className="absolute bottom-3 left-3 z-[1000] bg-gray-800 text-white text-sm px-3 py-1.5 rounded shadow"
        >
          ✏️ Редактирование
        </button>
      </div>
    );
  }

  // Desktop: split
  return (
    <div ref={containerRef} className="h-full flex relative">
      <div style={{ width: `${splitPercent}%` }} className="relative">
        <MapView>
          {cameras
            .filter((c) => c.lat != null)
            .map((c) => (
              <CameraMarker
                key={c.id}
                camera={c}
                isActive={c.id === selectedId}
                onClick={handleCameraClick}
              />
            ))}
        </MapView>
        <button
          onClick={() => setMode("edit")}
          className="absolute bottom-3 left-3 z-[1000] bg-gray-800 text-white text-sm px-3 py-1.5 rounded shadow"
        >
          ✏️ Редактирование
        </button>
      </div>

      {/* Resizable divider */}
      <div
        onMouseDown={handleMouseDown}
        className="w-1.5 bg-gray-700 hover:bg-blue-500 cursor-col-resize flex-shrink-0 flex items-center justify-center"
      >
        <div className="w-0.5 h-8 bg-gray-500 rounded" />
      </div>

      <div style={{ width: `${100 - splitPercent}%` }}>
        <StreamPlayer />
      </div>
    </div>
  );
}
