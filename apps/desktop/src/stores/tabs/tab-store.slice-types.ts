import type { StoreApi } from "zustand";
import type { TabStoreState } from "@/stores/tabs/tab-types";

export type TabStoreSet = StoreApi<TabStoreState>["setState"];
export type TabStoreGet = StoreApi<TabStoreState>["getState"];
