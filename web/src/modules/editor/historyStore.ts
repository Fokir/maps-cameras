import { create } from "zustand";
import type { Camera } from "@/shared/types";

interface HistoryState {
  undoStack: Camera[][];
  redoStack: Camera[][];
  pushSnapshot: (cameras: Camera[]) => void;
  undo: () => Camera[] | null;
  redo: () => Camera[] | null;
  clear: () => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  undoStack: [],
  redoStack: [],

  pushSnapshot: (cameras) => {
    const snapshot = cameras.map((c) => ({ ...c }));
    set((s) => ({
      undoStack: [...s.undoStack, snapshot],
      redoStack: [],
    }));
  },

  undo: () => {
    const { undoStack } = get();
    if (undoStack.length < 2) return null;
    const current = undoStack[undoStack.length - 1];
    const previous = undoStack[undoStack.length - 2];
    set((s) => ({
      undoStack: s.undoStack.slice(0, -1),
      redoStack: [...s.redoStack, current],
    }));
    return previous;
  },

  redo: () => {
    const { redoStack } = get();
    if (redoStack.length === 0) return null;
    const next = redoStack[redoStack.length - 1];
    set((s) => ({
      undoStack: [...s.undoStack, next],
      redoStack: s.redoStack.slice(0, -1),
    }));
    return next;
  },

  clear: () => set({ undoStack: [], redoStack: [] }),
}));
