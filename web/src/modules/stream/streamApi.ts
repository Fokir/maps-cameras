import { api } from "@/shared/api";
import type { StreamInfo } from "@/shared/types";

export const streamApi = {
  start: (cameraId: string) =>
    api.post<StreamInfo>("/stream/start", { camera_id: cameraId }),
  stop: (cameraId: string) =>
    api.post("/stream/stop", { camera_id: cameraId }),
  heartbeat: (cameraId: string) =>
    api.post("/stream/heartbeat", { camera_id: cameraId }),
};
