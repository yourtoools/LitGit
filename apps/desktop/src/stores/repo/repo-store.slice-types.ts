import type { StoreApi } from "zustand";
import type { RepoStoreState } from "@/stores/repo/repo-store-types";

export type RepoStoreSet = StoreApi<RepoStoreState>["setState"];
export type RepoStoreGet = StoreApi<RepoStoreState>["getState"];
