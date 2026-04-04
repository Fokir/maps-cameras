import { useMapEvents } from "react-leaflet";
import { useCameraStore } from "@/modules/camera/cameraStore";
import { useHistoryStore } from "./historyStore";
import { useEffect } from "react";

export function DragDrop() {
  const updateCamera = useCameraStore((s) => s.updateCamera);
  const cameras = useCameraStore((s) => s.cameras);
  const pushSnapshot = useHistoryStore((s) => s.pushSnapshot);

  const map = useMapEvents({});

  useEffect(() => {
    const container = map.getContainer();

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = "move";
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      const cameraId = e.dataTransfer!.getData("camera-id");
      if (!cameraId) return;

      const rect = container.getBoundingClientRect();
      const point = map.containerPointToLatLng([
        e.clientX - rect.left,
        e.clientY - rect.top,
      ]);

      const camera = cameras.find((c) => c.id === cameraId);
      if (camera) {
        pushSnapshot(cameras);
        updateCamera(cameraId, {
          ...camera,
          lat: point.lat,
          lng: point.lng,
        });
      }
    };

    container.addEventListener("dragover", handleDragOver);
    container.addEventListener("drop", handleDrop);
    return () => {
      container.removeEventListener("dragover", handleDragOver);
      container.removeEventListener("drop", handleDrop);
    };
  }, [map, cameras, updateCamera, pushSnapshot]);

  return null;
}
