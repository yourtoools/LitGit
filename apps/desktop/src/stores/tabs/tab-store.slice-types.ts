import type { StoreApi } from "zustand";
import type { TabStoreState } from "@/components/tabs/types/tab-types";

export type TabStoreSet = StoreApi<TabStoreState>["setState"];
export type TabStoreGet = StoreApi<TabStoreState>["getState"];
