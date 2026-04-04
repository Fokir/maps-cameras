import { useCameraStore } from "./cameraStore";
import { useEditorStore } from "@/modules/editor/editorStore";

export function CameraList() {
  const cameras = useCameraStore((s) => s.cameras);
  const editingId = useEditorStore((s) => s.editingCameraId);
  const setEditingId = useEditorStore((s) => s.setEditingCameraId);

  return (
    <div className="h-full flex flex-col bg-gray-900 border-r border-gray-700 p-3">
      <h3 className="text-xs uppercase tracking-wider text-gray-400 font-bold mb-3">
        Камеры
      </h3>

      <div className="flex-1 overflow-y-auto space-y-1.5">
        {cameras.map((cam) => {
          const onMap = cam.lat != null;
          return (
            <div
              key={cam.id}
              draggable={!onMap}
              onDragStart={(e) => {
                e.dataTransfer.setData("camera-id", cam.id);
              }}
              onClick={() => setEditingId(cam.id)}
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
        className="mt-3 bg-blue-600 hover:bg-blue-500 text-white text-sm py-2 rounded font-medium"
      >
        + Добавить
      </button>
    </div>
  );
}
