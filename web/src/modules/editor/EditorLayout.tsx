import { useEffect, useRef } from "react";
import { MapView } from "@/modules/map/MapView";
import { CameraMarker } from "@/modules/map/CameraMarker";
import { CameraList } from "@/modules/camera/CameraList";
import { CameraForm } from "@/modules/camera/CameraForm";
import { useCameraStore } from "@/modules/camera/cameraStore";
import { useEditorStore } from "./editorStore";
import { useHistoryStore } from "./historyStore";
import { DragDrop } from "./DragDrop";
import { CameraControls } from "@/modules/map/CameraControls";
import { MiniStreamPreview } from "@/modules/stream/MiniStreamPreview";

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

  // Initialize history on enter — but only once cameras are actually loaded.
  const historyInitialized = useRef(false);
  useEffect(() => {
    if (!historyInitialized.current && cameras.length > 0) {
      pushSnapshot(cameras);
      historyInitialized.current = true;
    }
  }, [cameras, pushSnapshot]);

  useEffect(() => {
    return () => {
      clear();
      historyInitialized.current = false;
    };
  }, [clear]);

  // Ctrl+Z / Ctrl+Shift+Z
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Use e.code (physical key) to be layout-independent — e.key returns "я"
      // on a Russian layout when the user presses Z.
      if (e.code !== "KeyZ") return;
      const isUndo = (e.ctrlKey || e.metaKey) && !e.shiftKey;
      const isRedo = (e.ctrlKey || e.metaKey) && e.shiftKey;
      if (!isUndo && !isRedo) return;
      e.preventDefault();
      e.stopPropagation();

      const snapshot = isUndo ? undo() : redo();
      if (!snapshot) return;

      const current = useCameraStore.getState().cameras;
      // Persist any cameras whose mutable fields differ from the snapshot.
      const mutableKeys: (keyof import("@/shared/types").Camera)[] = [
        "lat", "lng", "rotation", "angle", "distance", "name", "rtsp_url", "color",
      ];
      const changed = snapshot.filter((snap) => {
        const cur = current.find((c) => c.id === snap.id);
        if (!cur) return false;
        return mutableKeys.some((k) => cur[k] !== snap[k]);
      });

      // Apply locally first so the UI updates immediately.
      useCameraStore.setState({ cameras: snapshot });

      // Then sync each changed camera to the server.
      // We call the API directly to avoid updateCamera mutating cameras again
      // (which would race against our snapshot restore above).
      changed.forEach((cam) => {
        import("@/modules/camera/cameraApi").then(({ cameraApi }) =>
          cameraApi.update(cam.id, cam).catch((err) =>
            console.error("failed to sync undo/redo to server:", err)
          )
        );
      });
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
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
      <div className="w-[280px] flex-shrink-0">
        <CameraList />
      </div>

      <div className="flex-1 relative">
        <MapView>
          {cameras
            .filter((c) => c.lat != null && c.id !== selectedId)
            .map((c) => (
              <CameraMarker
                key={c.id}
                camera={c}
                isActive={false}
                coneInteractive={false}
                onClick={handleCameraClick}
              />
            ))}
          <DragDrop />
          {selectedId && cameras.find((c) => c.id === selectedId && c.lat != null) && (
            <CameraControls
              key={selectedId}
              camera={cameras.find((c) => c.id === selectedId)!}
            />
          )}
        </MapView>

        <div className="absolute top-3 left-3 z-[1000] bg-amber-600 text-gray-900 text-xs px-2.5 py-1 rounded border border-amber-700 shadow font-medium">
          🔧 Режим редактирования
        </div>

        <MiniStreamPreview />

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
