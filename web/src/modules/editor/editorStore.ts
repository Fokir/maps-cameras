import { create } from "zustand";
import type { AppMode } from "@/shared/types";

interface EditorState {
  mode: AppMode;
  editingCameraId: string | null;
  setMode: (mode: AppMode) => void;
  setEditingCameraId: (id: string | null) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  mode: "view",
  editingCameraId: null,
  setMode: (mode) => set({ mode, editingCameraId: null }),
  setEditingCameraId: (id) => set({ editingCameraId: id }),
}));
