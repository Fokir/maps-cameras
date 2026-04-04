import { api } from "@/shared/api";
import type { Camera, ImportResult } from "@/shared/types";

export const cameraApi = {
  getAll: () => api.get<Camera[]>("/cameras"),
  create: (data: Partial<Camera>) => api.post<Camera>("/cameras", data),
  update: (id: string, data: Partial<Camera>) =>
    api.put<Camera>(`/cameras/${id}`, data),
  delete: (id: string) => api.del(`/cameras/${id}`),
  importM3U: (file: File) => api.upload<ImportResult>("/cameras/import", file),
};
