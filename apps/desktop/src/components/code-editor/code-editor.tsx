import {
  bracketMatching,
  foldGutter,
  indentOnInput,
} from "@codemirror/language";
import { MergeView, unifiedMergeView } from "@codemirror/merge";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  crosshairCursor,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { minimalSetup } from "codemirror";
import { useEffect, useMemo, useRef } from "react";
import type {
  BlameDecoration,
  CodeEditorProps,
  DiffModeProps,
  EditModeProps,
  ViewModeProps,
} from "@/components/code-editor/code-editor-types";
import {
  isDiffMode,
  isEditMode,
  isViewMode,
} from "@/components/code-editor/code-editor-types";
import { blameGutterExtension } from "@/components/code-editor/extensions/blame-gutter";
import {
  createEditKeymap,
  createReadOnlyKeymap,
} from "@/components/code-editor/extensions/keymaps";
import { createLanguageSupport } from "@/components/code-editor/extensions/language-support";
import { createThemeExtension } from "@/components/code-editor/extensions/theme-extension";
import { createTrailingWhitespaceExtension } from "@/components/code-editor/extensions/whitespace-rendering";
import { resolveEditorBehavior } from "@/components/code-editor/utils/editor-config";

const themeCompartment = new Compartment();
const languageCompartment = new Compartment();
const blameCompartment = new Compartment();
const behaviorCompartment = new Compartment();

const commonSetupExtensions: Extension[] = [
  minimalSetup,
  dropCursor(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  indentOnInput(),
  bracketMatching(),
];

const createBlameExtension = (
  blameDecorations?: BlameDecoration[]
): Extension => {
  if (blameDecorations && blameDecorations.length > 0) {
    return blameGutterExtension(blameDecorations);
  }

  return [];
};

const createBehaviorExtensions = (
  input: Pick<
    ViewModeProps,
    "lineNumbers" | "syntaxHighlighting" | "tabSize" | "wordWrap"
  >
): Extension[] => {
  const behavior = resolveEditorBehavior(input);
  const extensions: Extension[] = [EditorState.tabSize.of(behavior.tabSize)];

  if (behavior.lineNumbers) {
    extensions.push(lineNumbers(), highlightActiveLineGutter(), foldGutter());
  }

  if (behavior.wordWrap) {
    extensions.push(EditorView.lineWrapping);
  }

  return extensions;
};

const createReadOnlyExtensions = (): Extension[] => [
  createReadOnlyKeymap(),
  EditorView.editable.of(false),
  EditorState.readOnly.of(true),
];

const createEditExtensions = (input: {
  onChange: (value: string) => void;
  onSave: () => void;
}): Extension[] => [
  createEditKeymap(() => {
    input.onSave();
  }),
  keymap.of([
    {
      key: "keydown",
      run: () => false,
    },
  ]),
  EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      input.onChange(update.state.doc.toString());
    }
  }),
];

function ViewModeEditor(props: ViewModeProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const initialConfigRef = useRef({
    blameDecorations: props.blameDecorations,
    fontFamily: props.fontFamily,
    fontSize: props.fontSize,
    lineNumbers: props.lineNumbers,
    onMount: props.onMount,
    syntaxHighlighting: props.syntaxHighlighting,
    tabSize: props.tabSize,
    theme: props.theme,
    value: props.value,
    wordWrap: props.wordWrap,
  });

  const baseExtensions = useMemo<Extension[]>(
    () => [...commonSetupExtensions, ...createReadOnlyExtensions()],
    []
  );

  useEffect(() => {
    const parent = parentRef.current;

    if (!parent) {
      return;
    }

    const initialConfig = initialConfigRef.current;

    const state = EditorState.create({
      doc: initialConfig.value,
      extensions: [
        ...baseExtensions,
        blameCompartment.of(
          createBlameExtension(initialConfig.blameDecorations)
        ),
        behaviorCompartment.of(
          createBehaviorExtensions({
            lineNumbers: initialConfig.lineNumbers,
            syntaxHighlighting: initialConfig.syntaxHighlighting,
            tabSize: initialConfig.tabSize,
            wordWrap: initialConfig.wordWrap,
          })
        ),
        themeCompartment.of(
          createThemeExtension(
            initialConfig.theme,
            initialConfig.fontFamily,
            initialConfig.fontSize
          )
        ),
        languageCompartment.of([]),
      ],
    });

    const view = new EditorView({
      parent,
      state,
    });

    viewRef.current = view;
    initialConfig.onMount?.(view);

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [baseExtensions]);

  useEffect(() => {
    if (!viewRef.current) {
      return;
    }

    const currentDoc = viewRef.current.state.doc.toString();

    if (currentDoc !== props.value) {
      viewRef.current.dispatch({
        changes: {
          from: 0,
          insert: props.value,
          to: currentDoc.length,
        },
      });
    }
  }, [props.value]);

  useEffect(() => {
    if (!viewRef.current) {
      return;
    }

    viewRef.current.dispatch({
      effects: themeCompartment.reconfigure(
        createThemeExtension(props.theme, props.fontFamily, props.fontSize)
      ),
    });
  }, [props.fontFamily, props.fontSize, props.theme]);

  useEffect(() => {
    if (!viewRef.current) {
      return;
    }

    viewRef.current.dispatch({
      effects: behaviorCompartment.reconfigure(
        createBehaviorExtensions({
          lineNumbers: props.lineNumbers,
          syntaxHighlighting: props.syntaxHighlighting,
          tabSize: props.tabSize,
          wordWrap: props.wordWrap,
        })
      ),
    });
  }, [
    props.lineNumbers,
    props.syntaxHighlighting,
    props.tabSize,
    props.wordWrap,
  ]);

  useEffect(() => {
    if (!viewRef.current) {
      return;
    }

    viewRef.current.dispatch({
      effects: blameCompartment.reconfigure(
        createBlameExtension(props.blameDecorations)
      ),
    });
  }, [props.blameDecorations]);

  useEffect(() => {
    if (!viewRef.current) {
      return;
    }

    let active = true;

    createLanguageSupport(props.language, props.syntaxHighlighting).then(
      (languageSupport) => {
        if (!(active && viewRef.current)) {
          return;
        }

        viewRef.current.dispatch({
          effects: languageCompartment.reconfigure(languageSupport),
        });
      }
    );

    return () => {
      active = false;
    };
  }, [props.language, props.syntaxHighlighting]);

  return (
    <div
      className="h-full w-full overflow-hidden"
      data-testid="code-editor-view"
      ref={parentRef}
    />
  );
}

function DiffModeEditor(props: DiffModeProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | MergeView | null>(null);

  useEffect(() => {
    const parent = parentRef.current;

    if (!parent) {
      return;
    }

    let active = true;
    let mountedEditor: EditorView | MergeView | null = null;
    const behaviorExtensions = createBehaviorExtensions({
      lineNumbers: props.lineNumbers,
      syntaxHighlighting: props.syntaxHighlighting,
      tabSize: props.tabSize,
      wordWrap: props.wordWrap,
    });
    const themeExtensions = createThemeExtension(
      props.theme,
      props.fontFamily,
      props.fontSize
    );

    const mountDiffEditor = async () => {
      const languageExtensions = await createLanguageSupport(
        props.language,
        props.syntaxHighlighting
      );

      if (!active) {
        return;
      }

      const sharedExtensions: Extension[] = [
        ...commonSetupExtensions,
        ...createReadOnlyExtensions(),
        ...behaviorExtensions,
        createTrailingWhitespaceExtension(
          props.showTrailingWhitespace ?? false
        ),
        ...themeExtensions,
        ...languageExtensions,
      ];

      if (props.renderSideBySide) {
        mountedEditor = new MergeView({
          a: {
            doc: props.original,
            extensions: sharedExtensions,
          },
          b: {
            doc: props.modified,
            extensions: sharedExtensions,
          },
          collapseUnchanged: props.collapseUnchanged ?? undefined,
          gutter: true,
          highlightChanges: true,
          parent,
        });
      } else {
        const state = EditorState.create({
          doc: props.modified,
          extensions: [
            ...sharedExtensions,
            unifiedMergeView({
              allowInlineDiffs: true,
              collapseUnchanged: props.collapseUnchanged ?? undefined,
              gutter: true,
              highlightChanges: true,
              mergeControls: false,
              original: props.original,
              syntaxHighlightDeletions: props.syntaxHighlighting,
            }),
          ],
        });

        mountedEditor = new EditorView({
          parent,
          state,
        });
      }

      editorRef.current = mountedEditor;
      props.onMount?.(mountedEditor);
    };

    mountDiffEditor().catch(() => undefined);

    return () => {
      active = false;

      if (mountedEditor instanceof MergeView) {
        mountedEditor.destroy();
      } else {
        mountedEditor?.destroy();
      }

      editorRef.current = null;
    };
  }, [
    props.collapseUnchanged,
    props.fontFamily,
    props.fontSize,
    props.language,
    props.lineNumbers,
    props.modified,
    props.onMount,
    props.original,
    props.renderSideBySide,
    props.showTrailingWhitespace,
    props.syntaxHighlighting,
    props.tabSize,
    props.theme,
    props.wordWrap,
  ]);

  return (
    <div
      className="h-full w-full overflow-hidden"
      data-testid="code-editor-diff"
      ref={parentRef}
    />
  );
}

function EditModeEditor(props: EditModeProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(props.onChange);
  const onSaveRef = useRef(props.onSave);
  const initialConfigRef = useRef({
    fontFamily: props.fontFamily,
    fontSize: props.fontSize,
    lineNumbers: props.lineNumbers,
    onMount: props.onMount,
    syntaxHighlighting: props.syntaxHighlighting,
    tabSize: props.tabSize,
    theme: props.theme,
    value: props.value,
    wordWrap: props.wordWrap,
  });

  useEffect(() => {
    onChangeRef.current = props.onChange;
  }, [props.onChange]);

  useEffect(() => {
    onSaveRef.current = props.onSave;
  }, [props.onSave]);

  const baseExtensions = useMemo<Extension[]>(
    () => [
      ...commonSetupExtensions,
      ...createEditExtensions({
        onChange: (value) => {
          onChangeRef.current(value);
        },
        onSave: () => {
          onSaveRef.current();
        },
      }),
    ],
    []
  );

  useEffect(() => {
    const parent = parentRef.current;

    if (!parent) {
      return;
    }

    const initialConfig = initialConfigRef.current;

    const state = EditorState.create({
      doc: initialConfig.value,
      extensions: [
        ...baseExtensions,
        behaviorCompartment.of(
          createBehaviorExtensions({
            lineNumbers: initialConfig.lineNumbers,
            syntaxHighlighting: initialConfig.syntaxHighlighting,
            tabSize: initialConfig.tabSize,
            wordWrap: initialConfig.wordWrap,
          })
        ),
        themeCompartment.of(
          createThemeExtension(
            initialConfig.theme,
            initialConfig.fontFamily,
            initialConfig.fontSize
          )
        ),
        languageCompartment.of([]),
      ],
    });

    const view = new EditorView({
      parent,
      state,
    });

    viewRef.current = view;
    initialConfig.onMount?.(view);
    view.focus();

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [baseExtensions]);

  useEffect(() => {
    if (!viewRef.current) {
      return;
    }

    const currentDoc = viewRef.current.state.doc.toString();

    if (currentDoc !== props.value) {
      viewRef.current.dispatch({
        changes: {
          from: 0,
          insert: props.value,
          to: currentDoc.length,
        },
      });
    }
  }, [props.value]);

  useEffect(() => {
    if (!viewRef.current) {
      return;
    }

    viewRef.current.dispatch({
      effects: themeCompartment.reconfigure(
        createThemeExtension(props.theme, props.fontFamily, props.fontSize)
      ),
    });
  }, [props.fontFamily, props.fontSize, props.theme]);

  useEffect(() => {
    if (!viewRef.current) {
      return;
    }

    viewRef.current.dispatch({
      effects: behaviorCompartment.reconfigure(
        createBehaviorExtensions({
          lineNumbers: props.lineNumbers,
          syntaxHighlighting: props.syntaxHighlighting,
          tabSize: props.tabSize,
          wordWrap: props.wordWrap,
        })
      ),
    });
  }, [
    props.lineNumbers,
    props.syntaxHighlighting,
    props.tabSize,
    props.wordWrap,
  ]);

  useEffect(() => {
    if (!viewRef.current) {
      return;
    }

    let active = true;

    createLanguageSupport(props.language, props.syntaxHighlighting).then(
      (languageSupport) => {
        if (!(active && viewRef.current)) {
          return;
        }

        viewRef.current.dispatch({
          effects: languageCompartment.reconfigure(languageSupport),
        });
      }
    );

    return () => {
      active = false;
    };
  }, [props.language, props.syntaxHighlighting]);

  return (
    <div
      className="h-full w-full overflow-hidden"
      data-testid="code-editor-edit"
      ref={parentRef}
    />
  );
}

export function CodeEditor(props: CodeEditorProps) {
  if (isViewMode(props)) {
    return <ViewModeEditor key={props.modelPath} {...props} />;
  }

  if (isDiffMode(props)) {
    return <DiffModeEditor key={props.modelPath} {...props} />;
  }

  if (isEditMode(props)) {
    return <EditModeEditor key={props.modelPath} {...props} />;
  }

  return null;
}

export default CodeEditor;
