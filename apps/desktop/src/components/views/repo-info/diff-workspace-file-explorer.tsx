import { Input } from "@litgit/ui/components/input";
import { useMemo, useState } from "react";
import type { RepositoryFileEntry } from "@/stores/repo/repo-store-types";

interface DiffWorkspaceFileExplorerProps {
  activePath: string | null;
  files: RepositoryFileEntry[];
  onSelectPath: (path: string) => void;
}

export function DiffWorkspaceFileExplorer({
  activePath,
  files,
  onSelectPath,
}: DiffWorkspaceFileExplorerProps) {
  const [query, setQuery] = useState("");

  const filteredFiles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (normalizedQuery.length === 0) {
      return [...files].sort((left, right) =>
        left.path.localeCompare(right.path)
      );
    }

    return files
      .filter((file) => file.path.toLowerCase().includes(normalizedQuery))
      .sort((left, right) => left.path.localeCompare(right.path));
  }, [files, query]);

  return (
    <aside className="absolute top-2 right-2 z-30 flex h-[55vh] w-[22rem] max-w-[85vw] flex-col overflow-hidden rounded-md border border-border/70 bg-background shadow-lg">
      <div className="border-border/70 border-b p-2">
        <p className="mb-1 font-medium text-xs">Files</p>
        <Input
          className="h-8"
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          placeholder="Filter files..."
          value={query}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-1">
        {filteredFiles.map((file) => (
          <button
            className={`block w-full rounded px-2 py-1.5 text-left text-xs ${
              file.path === activePath ? "bg-accent/40" : "hover:bg-accent/20"
            }`}
            key={file.path}
            onClick={() => {
              onSelectPath(file.path);
            }}
            type="button"
          >
            {file.path}
          </button>
        ))}
      </div>
    </aside>
  );
}
