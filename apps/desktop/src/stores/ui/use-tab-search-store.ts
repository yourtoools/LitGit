import { create } from "zustand";

type TabSearchMode = "commands" | "tabs";

interface TabSearchStore {
  close: () => void;
  isOpen: boolean;
  mode: TabSearchMode;
  open: (mode?: TabSearchMode) => void;
  setMode: (mode: TabSearchMode) => void;
  toggle: (mode?: TabSearchMode) => void;
}

export const useTabSearchStore = create<TabSearchStore>((set) => ({
  close: () => set({ isOpen: false, mode: "tabs" }),
  isOpen: false,
  mode: "tabs",
  open: (mode = "tabs") => set({ isOpen: true, mode }),
  setMode: (mode) => set({ mode }),
  toggle: (mode = "tabs") =>
    set((state) => {
      if (!state.isOpen) {
        return { isOpen: true, mode };
      }

      if (state.mode !== mode) {
        return { isOpen: true, mode };
      }

      return { isOpen: false, mode: "tabs" };
    }),
}));
