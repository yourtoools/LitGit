import { create } from "zustand";

interface BranchSearchStore {
  close: () => void;
  isOpen: boolean;
  open: () => void;
  toggle: () => void;
}

export const useBranchSearchStore = create<BranchSearchStore>((set) => ({
  close: () => set({ isOpen: false }),
  isOpen: false,
  open: () => set({ isOpen: true }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
}));
