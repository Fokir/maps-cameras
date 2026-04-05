import { useEffect } from "react";
import { useCameraStore } from "@/modules/camera/cameraStore";
import { useEditorStore } from "@/modules/editor/editorStore";
import { useStreamStore } from "./streamStore";
import { StreamPlayer } from "./StreamPlayer";

export function MiniStreamPreview() {
  const selectedId = useCameraStore((s) => s.selectedId);
  const editingId = useEditorStore((s) => s.editingCameraId);
  const cameras = useCameraStore((s) => s.cameras);
  const startStream = useStreamStore((s) => s.startStream);
  const stopStream = useStreamStore((s) => s.stopStream);
  const activeCameraId = useStreamStore((s) => s.activeCameraId);

  // editingId wins over selectedId — the user's latest interaction in the list
  // should override a previously-selected camera on the map.
  const validEditingId = editingId && editingId !== "new" ? editingId : null;
  const targetId = validEditingId || selectedId;
  const camera = targetId ? cameras.find((c) => c.id === targetId) : null;
  const hasValidUrl = !!camera?.rtsp_url && camera.rtsp_url.trim().length > 0;

  useEffect(() => {
    if (camera && hasValidUrl && camera.id !== activeCameraId) {
      startStream(camera.id);
    }
    if (!camera || !hasValidUrl) {
      if (activeCameraId) stopStream();
    }
  }, [camera?.id, hasValidUrl]);

  useEffect(() => {
    return () => {
      if (useStreamStore.getState().activeCameraId) {
        useStreamStore.getState().stopStream();
      }
    };
  }, []);

  if (!camera || !hasValidUrl) return null;

  return (
    <div className="absolute top-3 right-3 z-[1000] w-96 rounded-lg overflow-hidden shadow-lg border border-gray-700 bg-black">
      <div className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-900 border-b border-gray-700">
        <div
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: camera.color }}
        />
        <span className="text-xs text-gray-200 truncate flex-1">{camera.name}</span>
        <button
          onClick={() => useCameraStore.getState().selectCamera(null)}
          className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-white/10 active:scale-90 transition-all duration-150 text-xs leading-none"
          title="Закрыть превью"
        >
          ✕
        </button>
      </div>
      <div className="aspect-video">
        <StreamPlayer compact />
      </div>
    </div>
  );
}
