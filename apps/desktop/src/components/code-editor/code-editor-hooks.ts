import { EditorState, type Extension, StateEffect } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useEffect, useRef } from "react";

export function useEditorView(
  parentRef: React.RefObject<HTMLElement | null>,
  extensions: Extension[]
): EditorView | null {
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!parentRef.current || viewRef.current) {
      return;
    }

    const state = EditorState.create({
      extensions,
    });

    const view = new EditorView({
      state,
      parent: parentRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [parentRef, extensions]);

  return viewRef.current;
}

export function useEditorUpdate(
  view: EditorView | null,
  updateFn: (state: EditorState) => EditorState
): void {
  useEffect(() => {
    if (!view) {
      return;
    }

    const newState = updateFn(view.state);
    view.setState(newState);
  }, [view, updateFn]);
}

export function useReconfigureEffect(
  view: EditorView | null,
  extensions: Extension[]
): void {
  useEffect(() => {
    if (!view) {
      return;
    }

    view.dispatch({
      effects: StateEffect.reconfigure.of(extensions),
    });
  }, [view, extensions]);
}
