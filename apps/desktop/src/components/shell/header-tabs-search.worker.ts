import {
  type SearchHeaderTabsPaletteInput,
  type SearchHeaderTabsPaletteOutput,
  searchHeaderTabsPalette,
} from "@/lib/shell/header-tabs-search";
import { registerWorkerHandler } from "@/lib/workers/register-worker-handler";

registerWorkerHandler<
  SearchHeaderTabsPaletteInput,
  SearchHeaderTabsPaletteOutput
>((payload) => searchHeaderTabsPalette(payload));
