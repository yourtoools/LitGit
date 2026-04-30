import { lazy, Suspense } from "react";
import type { CodeEditorProps } from "@/components/code-editor/code-editor-types";

const LazyCodeEditorImplementation = lazy(async () => {
  const module = await import("@/components/code-editor/code-editor-runtime");

  return { default: module.CodeEditorImplementation };
});

export function CodeEditor(props: CodeEditorProps) {
  return (
    <Suspense
      fallback={
        <div
          className="h-full w-full overflow-hidden"
          data-testid="code-editor-loading"
        />
      }
    >
      <LazyCodeEditorImplementation {...props} />
    </Suspense>
  );
}
