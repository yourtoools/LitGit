import {
  type SearchHeaderTabsPaletteInput,
  type SearchHeaderTabsPaletteOutput,
  searchHeaderTabsPalette,
} from "@/components/shell/header-tabs-search-search";
import { registerWorkerHandler } from "@/lib/workers/register-worker-handler";

registerWorkerHandler<
  SearchHeaderTabsPaletteInput,
  SearchHeaderTabsPaletteOutput
>((payload) => searchHeaderTabsPalette(payload));
