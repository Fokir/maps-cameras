import { useEffect } from "react";
import { MapView } from "@/modules/map/MapView";
import { CameraMarker } from "@/modules/map/CameraMarker";
import { CameraList } from "@/modules/camera/CameraList";
import { CameraForm } from "@/modules/camera/CameraForm";
import { useCameraStore } from "@/modules/camera/cameraStore";
import { useEditorStore } from "./editorStore";
import { useHistoryStore } from "./historyStore";
import { DragDrop } from "./DragDrop";

export function EditorLayout() {
  const cameras = useCameraStore((s) => s.cameras);
  const selectCamera = useCameraStore((s) => s.selectCamera);
  const selectedId = useCameraStore((s) => s.selectedId);
  const setMode = useEditorStore((s) => s.setMode);
  const setEditingId = useEditorStore((s) => s.setEditingCameraId);
  const pushSnapshot = useHistoryStore((s) => s.pushSnapshot);
  const undo = useHistoryStore((s) => s.undo);
  const redo = useHistoryStore((s) => s.redo);
  const clear = useHistoryStore((s) => s.clear);
  const fetchCameras = useCameraStore((s) => s.fetchCameras);

  // Initialize history on enter
  useEffect(() => {
    pushSnapshot(cameras);
    return () => clear();
  }, []);

  // Ctrl+Z / Ctrl+Shift+Z
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        const prev = undo();
        if (prev) {
          useCameraStore.setState({ cameras: prev });
        }
      }
      if (e.ctrlKey && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        const next = redo();
        if (next) {
          useCameraStore.setState({ cameras: next });
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);

  const handleCameraClick = (id: string) => {
    selectCamera(id);
    setEditingId(id);
  };

  const handleExitEdit = () => {
    fetchCameras();
    setMode("view");
  };

  return (
    <div className="h-full flex">
      <div className="w-[200px] flex-shrink-0">
        <CameraList />
      </div>

      <div className="flex-1 relative">
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
          <DragDrop />
        </MapView>

        <div className="absolute top-3 left-3 z-[1000] bg-amber-900/30 text-amber-400 text-xs px-2.5 py-1 rounded border border-amber-700/30">
          🔧 Режим редактирования
        </div>

        <button
          onClick={handleExitEdit}
          className="absolute bottom-3 left-3 z-[1000] bg-amber-600 hover:bg-amber-500 text-gray-900 text-sm px-3 py-1.5 rounded shadow font-medium"
        >
          👁 Просмотр
        </button>
      </div>

      <div className="w-[280px] flex-shrink-0">
        <CameraForm />
      </div>
    </div>
  );
}
