import { useEffect, useState } from "react";
import { useCameraStore } from "./cameraStore";
import { useEditorStore } from "@/modules/editor/editorStore";
import { useHistoryStore } from "@/modules/editor/historyStore";

const COLORS = [
  "#f7768e", "#7aa2f7", "#9ece6a", "#e0af68",
  "#bb9af7", "#73daca", "#ff9e64", "#7dcfff",
];

export function CameraForm() {
  const editingId = useEditorStore((s) => s.editingCameraId);
  const setEditingId = useEditorStore((s) => s.setEditingCameraId);
  const cameras = useCameraStore((s) => s.cameras);
  const createCamera = useCameraStore((s) => s.createCamera);
  const updateCamera = useCameraStore((s) => s.updateCamera);
  const deleteCamera = useCameraStore((s) => s.deleteCamera);
  const pushSnapshot = useHistoryStore((s) => s.pushSnapshot);

  const isNew = editingId === "new";
  const camera = isNew ? null : cameras.find((c) => c.id === editingId);

  const [name, setName] = useState("");
  const [rtspUrl, setRtspUrl] = useState("");
  const [color, setColor] = useState(COLORS[0]);

  useEffect(() => {
    if (camera) {
      setName(camera.name);
      setRtspUrl(camera.rtsp_url);
      setColor(camera.color);
    } else {
      setName("");
      setRtspUrl("");
      setColor(COLORS[0]);
    }
  }, [camera, editingId]);

  if (!editingId) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 text-gray-500 text-sm border-l border-gray-700">
        Выберите камеру для редактирования
      </div>
    );
  }

  const handleSave = async () => {
    pushSnapshot(cameras);
    if (isNew) {
      const created = await createCamera({ name, rtsp_url: rtspUrl, color });
      // Keep the form open on the freshly created camera instead of closing it.
      setEditingId(created.id);
    } else if (camera) {
      await updateCamera(camera.id, { ...camera, name, rtsp_url: rtspUrl, color });
    }
  };

  const handleDelete = async () => {
    if (camera) {
      pushSnapshot(cameras);
      await deleteCamera(camera.id);
      setEditingId(null);
    }
  };

  return (
    <div className="h-full bg-gray-900 border-l border-gray-700 p-4 flex flex-col">
      <h3 className="text-sm font-bold text-gray-300 mb-4">
        {isNew ? "Новая камера" : "Редактирование камеры"}
      </h3>

      <div className="space-y-4 flex-1">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Название</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white"
            placeholder="Вход №1"
          />
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">RTSP URL</label>
          <input
            value={rtspUrl}
            onChange={(e) => setRtspUrl(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white"
            placeholder="rtsp://192.168.1.10/stream1"
          />
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Цвет</label>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="w-7 h-7 rounded transition"
                style={{
                  backgroundColor: c,
                  border: c === color ? "3px solid white" : "2px solid transparent",
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <button
          onClick={handleSave}
          disabled={!name || !rtspUrl}
          className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm py-2 rounded font-medium"
        >
          Сохранить
        </button>
        {!isNew && (
          <button
            onClick={handleDelete}
            className="flex-1 bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-800/50 text-sm py-2 rounded"
          >
            Удалить
          </button>
        )}
      </div>
    </div>
  );
}
