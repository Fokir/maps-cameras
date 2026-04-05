import { create } from "zustand";

type TileLayer = "streets" | "satellite";

interface MapState {
  center: [number, number];
  zoom: number;
  tileLayer: TileLayer;
  // Imperative fit-bounds request. MapController watches fitBoundsRequest and
  // calls map.fitBounds with the provided coords when it changes.
  fitBoundsRequest: {
    coords: [number, number][];
    counter: number;
  } | null;
  setCenter: (center: [number, number]) => void;
  setZoom: (zoom: number) => void;
  toggleTileLayer: () => void;
  fitBounds: (coords: [number, number][]) => void;
}

export const useMapStore = create<MapState>((set) => ({
  center: [54.3142, 48.4031],
  zoom: 18,
  tileLayer: "streets",
  fitBoundsRequest: null,
  setCenter: (center) => set({ center }),
  setZoom: (zoom) => set({ zoom }),
  toggleTileLayer: () =>
    set((s) => ({
      tileLayer: s.tileLayer === "streets" ? "satellite" : "streets",
    })),
  fitBounds: (coords) =>
    set((s) => ({
      fitBoundsRequest: {
        coords,
        counter: (s.fitBoundsRequest?.counter ?? 0) + 1,
      },
    })),
}));
