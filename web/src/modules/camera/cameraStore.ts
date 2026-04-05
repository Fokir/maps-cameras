import { create } from "zustand";
import type { Camera } from "@/shared/types";
import { cameraApi } from "./cameraApi";

interface CameraState {
  cameras: Camera[];
  selectedId: string | null;
  loading: boolean;

  fetchCameras: () => Promise<void>;
  createCamera: (data: Partial<Camera>) => Promise<Camera>;
  updateCamera: (id: string, data: Partial<Camera>) => Promise<Camera>;
  deleteCamera: (id: string) => Promise<void>;
  selectCamera: (id: string | null) => void;
}

export const useCameraStore = create<CameraState>((set, get) => ({
  cameras: [],
  selectedId: null,
  loading: false,

  fetchCameras: async () => {
    set({ loading: true });
    const cameras = await cameraApi.getAll();
    set({ cameras, loading: false });
  },

  createCamera: async (data) => {
    const camera = await cameraApi.create(data);
    set((s) => ({ cameras: [...s.cameras, camera] }));
    return camera;
  },

  updateCamera: async (id, data) => {
    // Optimistic update: apply locally immediately, then sync to the server.
    const current = get().cameras.find((c) => c.id === id);
    if (!current) throw new Error(`camera not found: ${id}`);
    const optimistic: Camera = { ...current, ...data, id };
    set((s) => ({
      cameras: s.cameras.map((c) => (c.id === id ? optimistic : c)),
    }));
    try {
      const updated = await cameraApi.update(id, optimistic);
      set((s) => ({
        cameras: s.cameras.map((c) => (c.id === id ? updated : c)),
      }));
      return updated;
    } catch (err) {
      // Rollback on failure
      set((s) => ({
        cameras: s.cameras.map((c) => (c.id === id ? current : c)),
      }));
      throw err;
    }
  },

  deleteCamera: async (id) => {
    await cameraApi.delete(id);
    set((s) => ({
      cameras: s.cameras.filter((c) => c.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    }));
  },

  selectCamera: (id) => set({ selectedId: id }),
}));
