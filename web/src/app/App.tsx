import { useEffect, useRef } from "react";
import { ViewerLayout } from "./ViewerLayout";
import { EditorLayout } from "@/modules/editor/EditorLayout";
import { useCameraStore } from "@/modules/camera/cameraStore";
import { useEditorStore } from "@/modules/editor/editorStore";
import { useMapStore } from "@/modules/map/mapStore";
import { api } from "@/shared/api";
import type { MapConfig } from "@/shared/types";
import { ToastProvider } from "@/shared/toast/ToastProvider";

export function App() {
  const fetchCameras = useCameraStore((s) => s.fetchCameras);
  const cameras = useCameraStore((s) => s.cameras);
  const mode = useEditorStore((s) => s.mode);
  const initialFitDone = useRef(false);

  useEffect(() => {
    fetchCameras();
    api.get<MapConfig>("/config/map").then((cfg) => {
      useMapStore.getState().setCenter(cfg.center);
      useMapStore.getState().setZoom(cfg.zoom);
    });
  }, [fetchCameras]);

  // Once cameras arrive, fit the map to show all placed cameras.
  useEffect(() => {
    if (initialFitDone.current) return;
    if (cameras.length === 0) return;
    const placed = cameras.filter(
      (c): c is typeof c & { lat: number; lng: number } =>
        c.lat != null && c.lng != null
    );
    if (placed.length === 0) return;
    useMapStore.getState().fitBounds(
      placed.map((c) => [c.lat, c.lng] as [number, number])
    );
    initialFitDone.current = true;
  }, [cameras]);

  return (
    <ToastProvider>
      {mode === "edit" ? <EditorLayout /> : <ViewerLayout />}
    </ToastProvider>
  );
}
