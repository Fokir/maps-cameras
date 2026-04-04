import { useEffect } from "react";
import { ViewerLayout } from "./ViewerLayout";
import { useCameraStore } from "@/modules/camera/cameraStore";
import { useEditorStore } from "@/modules/editor/editorStore";
import { useMapStore } from "@/modules/map/mapStore";
import { api } from "@/shared/api";
import type { MapConfig } from "@/shared/types";

export function App() {
  const fetchCameras = useCameraStore((s) => s.fetchCameras);
  const mode = useEditorStore((s) => s.mode);

  useEffect(() => {
    fetchCameras();
    api.get<MapConfig>("/config/map").then((cfg) => {
      useMapStore.getState().setCenter(cfg.center);
      useMapStore.getState().setZoom(cfg.zoom);
    });
  }, [fetchCameras]);

  if (mode === "edit") {
    return <div className="h-full bg-gray-900 text-white p-4">Editor (coming in Task 16)</div>;
  }

  return <ViewerLayout />;
}
