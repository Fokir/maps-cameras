import { useCameraStore } from "./cameraStore";
import { useEditorStore } from "@/modules/editor/editorStore";
import { useMapStore } from "@/modules/map/mapStore";
import { ImportM3U } from "./ImportM3U";
import type { Camera } from "@/shared/types";

export function CameraList() {
  const cameras = useCameraStore((s) => s.cameras);
  const selectCamera = useCameraStore((s) => s.selectCamera);
  const editingId = useEditorStore((s) => s.editingCameraId);
  const setEditingId = useEditorStore((s) => s.setEditingCameraId);
  const setCenter = useMapStore((s) => s.setCenter);

  const handleSelect = (cam: Camera) => {
    setEditingId(cam.id);
    if (cam.lat != null && cam.lng != null) {
      selectCamera(cam.id);
      setCenter([cam.lat, cam.lng]);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-900 border-r border-gray-700 py-3 pl-3 pr-1">
      <h3 className="text-xs uppercase tracking-wider text-gray-400 font-bold mb-3 pr-2">
        Камеры
      </h3>

      <div className="flex-1 overflow-y-auto space-y-1.5 pr-2">
        {cameras.map((cam) => {
          const onMap = cam.lat != null;
          return (
            <div
              key={cam.id}
              draggable={!onMap}
              onDragStart={(e) => {
                e.dataTransfer.setData("camera-id", cam.id);
              }}
              onClick={() => handleSelect(cam)}
              className={`flex items-center gap-2 px-2.5 py-2 rounded cursor-pointer border transition
                ${editingId === cam.id ? "border-blue-500 bg-gray-800" : "border-gray-700 hover:bg-gray-800"}
                ${!onMap ? "cursor-grab" : ""}
                ${onMap ? "opacity-60" : ""}
              `}
            >
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: cam.color }}
              />
              <span className="text-sm text-gray-200 flex-1 truncate">
                {cam.name}
              </span>
              {onMap && (
                <span className="text-xs text-gray-500">✓</span>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={() => setEditingId("new")}
        className="mt-3 mr-2 px-3 bg-blue-500/80 hover:bg-blue-400/80 text-white text-sm py-2 rounded-lg font-medium shadow-md shadow-black/20 ring-1 ring-white/15 hover:ring-white/25 active:scale-[0.98] transition-all duration-150"
      >
        + Добавить
      </button>
      <div className="mt-2 mr-2">
        <ImportM3U />
      </div>
    </div>
  );
}
