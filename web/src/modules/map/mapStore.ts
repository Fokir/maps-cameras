import { create } from "zustand";

type TileLayer = "streets" | "satellite";

interface MapState {
  center: [number, number];
  zoom: number;
  tileLayer: TileLayer;
  setCenter: (center: [number, number]) => void;
  setZoom: (zoom: number) => void;
  toggleTileLayer: () => void;
}

export const useMapStore = create<MapState>((set) => ({
  center: [54.3142, 48.4031],
  zoom: 18,
  tileLayer: "streets",
  setCenter: (center) => set({ center }),
  setZoom: (zoom) => set({ zoom }),
  toggleTileLayer: () =>
    set((s) => ({
      tileLayer: s.tileLayer === "streets" ? "satellite" : "streets",
    })),
}));
