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
  const [isVertical, setIsVertical] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      setIsVertical(height > width);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
      const percent = isVertical
        ? ((e.clientY - rect.top) / rect.height) * 100
        : ((e.clientX - rect.left) / rect.width) * 100;
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
  }, [isVertical]);

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
          className="absolute top-3 left-3 z-10 bg-slate-700/75 hover:bg-slate-600/75 text-white text-sm px-3 py-1.5 rounded-lg shadow-md shadow-black/30 ring-1 ring-white/15 hover:ring-white/25 backdrop-blur-sm active:scale-95 transition-all duration-150"
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
          className="absolute bottom-3 left-3 z-[1000] bg-slate-700/85 hover:bg-slate-600/85 text-white text-sm px-3 py-1.5 rounded-lg shadow-md shadow-black/30 ring-1 ring-white/15 hover:ring-white/25 backdrop-blur-sm active:scale-95 transition-all duration-150"
        >
          ✏️ Редактирование
        </button>
      </div>
    );
  }

  // Desktop: split
  const primarySize = { [isVertical ? "height" : "width"]: `${splitPercent}%` };
  const secondarySize = { [isVertical ? "height" : "width"]: `${100 - splitPercent}%` };
  return (
    <div ref={containerRef} className={`h-full flex relative ${isVertical ? "flex-col" : ""}`}>
      <div style={primarySize} className="relative">
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
          className="absolute bottom-3 left-3 z-[1000] bg-slate-700/85 hover:bg-slate-600/85 text-white text-sm px-3 py-1.5 rounded-lg shadow-md shadow-black/30 ring-1 ring-white/15 hover:ring-white/25 backdrop-blur-sm active:scale-95 transition-all duration-150"
        >
          ✏️ Редактирование
        </button>
      </div>

      {/* Resizable divider */}
      <div
        onMouseDown={handleMouseDown}
        className={`bg-gray-700 hover:bg-blue-500 flex-shrink-0 flex items-center justify-center ${
          isVertical ? "h-1.5 w-full cursor-row-resize" : "w-1.5 h-full cursor-col-resize"
        }`}
      >
        <div className={isVertical ? "h-0.5 w-8 bg-gray-500 rounded" : "w-0.5 h-8 bg-gray-500 rounded"} />
      </div>

      <div style={secondarySize}>
        <StreamPlayer />
      </div>
    </div>
  );
}
