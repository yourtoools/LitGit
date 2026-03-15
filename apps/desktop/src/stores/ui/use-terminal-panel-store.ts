import { create } from "zustand";

const DEFAULT_TERMINAL_PANEL_HEIGHT = 240;
const MAX_TERMINAL_PANEL_HEIGHT = 520;
const MIN_TERMINAL_PANEL_HEIGHT = 160;

interface TerminalPanelStoreState {
  height: number;
  isOpen: boolean;
  setHeight: (height: number) => void;
  toggle: () => void;
}

const clampHeight = (height: number): number =>
  Math.min(
    MAX_TERMINAL_PANEL_HEIGHT,
    Math.max(MIN_TERMINAL_PANEL_HEIGHT, Math.round(height))
  );

export const useTerminalPanelStore = create<TerminalPanelStoreState>((set) => ({
  isOpen: false,
  height: DEFAULT_TERMINAL_PANEL_HEIGHT,
  setHeight: (height) => {
    set({ height: clampHeight(height) });
  },
  toggle: () => {
    set((state) => ({ isOpen: !state.isOpen }));
  },
}));

export const terminalPanelHeightLimits = {
  max: MAX_TERMINAL_PANEL_HEIGHT,
  min: MIN_TERMINAL_PANEL_HEIGHT,
} as const;
