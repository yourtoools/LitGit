import { create } from "zustand";

interface TabSearchStore {
  close: () => void;
  isOpen: boolean;
  open: () => void;
  toggle: () => void;
}

export const useTabSearchStore = create<TabSearchStore>((set) => ({
  close: () => set({ isOpen: false }),
  isOpen: false,
  open: () => set({ isOpen: true }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
}));
