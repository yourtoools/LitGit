import { registerWorkerHandler } from "@/lib/workers/register-worker-handler";
import {
  searchHeaderTabsPalette,
  type SearchHeaderTabsPaletteInput,
  type SearchHeaderTabsPaletteOutput,
} from "@/components/shell/header-tabs-search-search";

registerWorkerHandler<SearchHeaderTabsPaletteInput, SearchHeaderTabsPaletteOutput>(
  (payload) => searchHeaderTabsPalette(payload)
);

export {};
