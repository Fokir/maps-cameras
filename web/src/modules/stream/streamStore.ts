import { create } from "zustand";
import type { StreamInfo } from "@/shared/types";
import { streamApi } from "./streamApi";

interface StreamState {
  activeCameraId: string | null;
  streamInfo: StreamInfo | null;
  loading: boolean;
  error: string | null;
  heartbeatInterval: ReturnType<typeof setInterval> | null;

  startStream: (cameraId: string) => Promise<void>;
  stopStream: () => Promise<void>;
}

export const useStreamStore = create<StreamState>((set, get) => ({
  activeCameraId: null,
  streamInfo: null,
  loading: false,
  error: null,
  heartbeatInterval: null,

  startStream: async (cameraId) => {
    const { activeCameraId, stopStream } = get();
    if (activeCameraId) await stopStream();

    set({ loading: true, error: null });
    try {
      const info = await streamApi.start(cameraId);
      const interval = setInterval(() => {
        streamApi.heartbeat(cameraId).catch(() => {});
      }, 10_000);
      set({
        activeCameraId: cameraId,
        streamInfo: info,
        loading: false,
        heartbeatInterval: interval,
      });
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  stopStream: async () => {
    const { activeCameraId, heartbeatInterval } = get();
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    if (activeCameraId) {
      await streamApi.stop(activeCameraId).catch(() => {});
    }
    set({
      activeCameraId: null,
      streamInfo: null,
      heartbeatInterval: null,
    });
  },
}));
