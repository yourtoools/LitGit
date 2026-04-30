import type { Tab, TabGroup } from "@/components/tabs/types/tab-types";

export type RenderItem =
  | { type: "tab"; tab: Tab }
  | { type: "group"; group: TabGroup; tabs: Tab[] };

type PendingUngroupAction = "ungroup" | "close";

export interface PendingUngroupTab {
  action: PendingUngroupAction;
  dropIndex: number | null;
  groupId: string;
  tabId: string;
}

export interface PendingUngroupTabDetails {
  group: TabGroup;
  tab: Tab;
}

export interface UngroupConfirmDialogContent {
  actionText: string;
  description: string;
  title: string;
}

export interface GroupTabStats {
  count: number;
  endOrder: number;
  startOrder: number;
}
