import {
  bracketMatching,
  foldGutter,
  indentOnInput,
} from "@codemirror/language";
import { MergeView, unifiedMergeView } from "@codemirror/merge";
import { minimalSetup } from "codemirror";
import { type MutableRefObject, useEffect, useRef } from "react";
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

type Compartment = import("@codemirror/state").Compartment;
type EditorView = import("@codemirror/view").EditorView;
type Extension = import("@codemirror/state").Extension;

interface CodeMirrorCore {
  Compartment: typeof import("@codemirror/state").Compartment;
  crosshairCursor: typeof import("@codemirror/view").crosshairCursor;
  dropCursor: typeof import("@codemirror/view").dropCursor;
  EditorState: typeof import("@codemirror/state").EditorState;
  EditorView: typeof import("@codemirror/view").EditorView;
  highlightActiveLine: typeof import("@codemirror/view").highlightActiveLine;
  highlightActiveLineGutter: typeof import("@codemirror/view").highlightActiveLineGutter;
  keymap: typeof import("@codemirror/view").keymap;
  lineNumbers: typeof import("@codemirror/view").lineNumbers;
  rectangularSelection: typeof import("@codemirror/view").rectangularSelection;
}

interface EditorCompartments {
  behavior: Compartment;
  blame: Compartment;
  language: Compartment;
  theme: Compartment;
}

const codeMirrorCorePromise = Promise.all([
  import("@codemirror/state"),
  import("@codemirror/view"),
]).then(
  ([state, view]): CodeMirrorCore => ({
    Compartment: state.Compartment,
    EditorState: state.EditorState,
    EditorView: view.EditorView,
    crosshairCursor: view.crosshairCursor,
    dropCursor: view.dropCursor,
    highlightActiveLine: view.highlightActiveLine,
    highlightActiveLineGutter: view.highlightActiveLineGutter,
    keymap: view.keymap,
    lineNumbers: view.lineNumbers,
    rectangularSelection: view.rectangularSelection,
  })
);

const createEditorCompartments = (
  core: Pick<CodeMirrorCore, "Compartment">
): EditorCompartments => ({
  behavior: new core.Compartment(),
  blame: new core.Compartment(),
  language: new core.Compartment(),
  theme: new core.Compartment(),
});

const getEditorCompartments = (
  ref: MutableRefObject<EditorCompartments | null>,
  core: Pick<CodeMirrorCore, "Compartment">
): EditorCompartments => {
  ref.current ??= createEditorCompartments(core);

  return ref.current;
};

const createCommonSetupExtensions = (core: CodeMirrorCore): Extension[] => [
  minimalSetup,
  core.dropCursor(),
  core.rectangularSelection(),
  core.crosshairCursor(),
  core.highlightActiveLine(),
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
  core: CodeMirrorCore,
  input: Pick<
    ViewModeProps,
    "lineNumbers" | "syntaxHighlighting" | "tabSize" | "wordWrap"
  >
): Extension[] => {
  const behavior = resolveEditorBehavior(input);
  const extensions: Extension[] = [
    core.EditorState.tabSize.of(behavior.tabSize),
  ];

  if (behavior.lineNumbers) {
    extensions.push(
      core.lineNumbers(),
      core.highlightActiveLineGutter(),
      foldGutter()
    );
  }

  if (behavior.wordWrap) {
    extensions.push(core.EditorView.lineWrapping);
  }

  return extensions;
};

const createReadOnlyExtensions = (core: CodeMirrorCore): Extension[] => [
  createReadOnlyKeymap(),
  core.EditorView.editable.of(false),
  core.EditorState.readOnly.of(true),
];

const createEditExtensions = (
  core: CodeMirrorCore,
  input: {
    onChange: (value: string) => void;
    onSave: () => void;
  }
): Extension[] => [
  createEditKeymap(() => {
    input.onSave();
  }),
  core.keymap.of([
    {
      key: "keydown",
      run: () => false,
    },
  ]),
  core.EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      input.onChange(update.state.doc.toString());
    }
  }),
];

function ViewModeEditor(props: ViewModeProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const compartmentsRef = useRef<EditorCompartments | null>(null);
  const initialConfigRef = useRef({
    blameDecorations: props.blameDecorations,
    fontFamily: props.fontFamily,
    fontSize: props.fontSize,
    language: props.language,
    lineNumbers: props.lineNumbers,
    onMount: props.onMount,
    syntaxHighlighting: props.syntaxHighlighting,
    tabSize: props.tabSize,
    theme: props.theme,
    value: props.value,
    wordWrap: props.wordWrap,
  });

  useEffect(() => {
    const parent = parentRef.current;

    if (!parent) {
      return;
    }

    let active = true;
    let mountedView: EditorView | null = null;
    const initialConfig = initialConfigRef.current;

    Promise.all([
      codeMirrorCorePromise,
      createLanguageSupport(
        initialConfig.language,
        initialConfig.syntaxHighlighting
      ),
    ]).then(([core, languageSupport]) => {
      if (!active) {
        return;
      }

      const compartments = getEditorCompartments(compartmentsRef, core);
      const state = core.EditorState.create({
        doc: initialConfig.value,
        extensions: [
          ...createCommonSetupExtensions(core),
          ...createReadOnlyExtensions(core),
          compartments.blame.of(
            createBlameExtension(initialConfig.blameDecorations)
          ),
          compartments.behavior.of(
            createBehaviorExtensions(core, {
              lineNumbers: initialConfig.lineNumbers,
              syntaxHighlighting: initialConfig.syntaxHighlighting,
              tabSize: initialConfig.tabSize,
              wordWrap: initialConfig.wordWrap,
            })
          ),
          compartments.theme.of(
            createThemeExtension(
              initialConfig.theme,
              initialConfig.fontFamily,
              initialConfig.fontSize
            )
          ),
          compartments.language.of(languageSupport),
        ],
      });

      mountedView = new core.EditorView({
        parent,
        state,
      });

      viewRef.current = mountedView;
      initialConfig.onMount?.(mountedView);
    });

    return () => {
      active = false;
      mountedView?.destroy();
      viewRef.current = null;
    };
  }, []);

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

    codeMirrorCorePromise.then((core) => {
      const compartments = getEditorCompartments(compartmentsRef, core);
      viewRef.current?.dispatch({
        effects: compartments.theme.reconfigure(
          createThemeExtension(props.theme, props.fontFamily, props.fontSize)
        ),
      });
    });
  }, [props.fontFamily, props.fontSize, props.theme]);

  useEffect(() => {
    if (!viewRef.current) {
      return;
    }

    codeMirrorCorePromise.then((core) => {
      const compartments = getEditorCompartments(compartmentsRef, core);
      viewRef.current?.dispatch({
        effects: compartments.behavior.reconfigure(
          createBehaviorExtensions(core, {
            lineNumbers: props.lineNumbers,
            syntaxHighlighting: props.syntaxHighlighting,
            tabSize: props.tabSize,
            wordWrap: props.wordWrap,
          })
        ),
      });
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

    codeMirrorCorePromise.then((core) => {
      const compartments = getEditorCompartments(compartmentsRef, core);
      viewRef.current?.dispatch({
        effects: compartments.blame.reconfigure(
          createBlameExtension(props.blameDecorations)
        ),
      });
    });
  }, [props.blameDecorations]);

  useEffect(() => {
    if (!viewRef.current) {
      return;
    }

    let active = true;

    Promise.all([
      codeMirrorCorePromise,
      createLanguageSupport(props.language, props.syntaxHighlighting),
    ]).then(([core, languageSupport]) => {
      if (!(active && viewRef.current)) {
        return;
      }

      const compartments = getEditorCompartments(compartmentsRef, core);
      viewRef.current.dispatch({
        effects: compartments.language.reconfigure(languageSupport),
      });
    });

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

    const mountDiffEditor = () => {
      if (!active) {
        return;
      }

      Promise.all([
        codeMirrorCorePromise,
        createLanguageSupport(props.language, props.syntaxHighlighting),
      ])
        .then(([core, languageExtensions]) => {
          if (!active) {
            return;
          }

          const behaviorExtensions = createBehaviorExtensions(core, {
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
          const sharedExtensions: Extension[] = [
            ...createCommonSetupExtensions(core),
            ...createReadOnlyExtensions(core),
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
            const state = core.EditorState.create({
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

            mountedEditor = new core.EditorView({
              parent,
              state,
            });
          }

          editorRef.current = mountedEditor;
          props.onMount?.(mountedEditor);
        })
        .catch(() => undefined);
    };

    mountDiffEditor();

    return () => {
      active = false;

      mountedEditor?.destroy();

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
      className="litgit-code-editor-diff h-full w-full overflow-hidden"
      data-testid="code-editor-diff"
      ref={parentRef}
    />
  );
}

function EditModeEditor(props: EditModeProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const compartmentsRef = useRef<EditorCompartments | null>(null);
  const onChangeRef = useRef(props.onChange);
  const onSaveRef = useRef(props.onSave);
  const initialConfigRef = useRef({
    fontFamily: props.fontFamily,
    fontSize: props.fontSize,
    language: props.language,
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

  useEffect(() => {
    const parent = parentRef.current;

    if (!parent) {
      return;
    }

    let active = true;
    let mountedView: EditorView | null = null;
    const initialConfig = initialConfigRef.current;

    Promise.all([
      codeMirrorCorePromise,
      createLanguageSupport(
        initialConfig.language,
        initialConfig.syntaxHighlighting
      ),
    ]).then(([core, languageSupport]) => {
      if (!active) {
        return;
      }

      const compartments = getEditorCompartments(compartmentsRef, core);
      const state = core.EditorState.create({
        doc: initialConfig.value,
        extensions: [
          ...createCommonSetupExtensions(core),
          ...createEditExtensions(core, {
            onChange: (value) => {
              onChangeRef.current(value);
            },
            onSave: () => {
              onSaveRef.current();
            },
          }),
          compartments.behavior.of(
            createBehaviorExtensions(core, {
              lineNumbers: initialConfig.lineNumbers,
              syntaxHighlighting: initialConfig.syntaxHighlighting,
              tabSize: initialConfig.tabSize,
              wordWrap: initialConfig.wordWrap,
            })
          ),
          compartments.theme.of(
            createThemeExtension(
              initialConfig.theme,
              initialConfig.fontFamily,
              initialConfig.fontSize
            )
          ),
          compartments.language.of(languageSupport),
        ],
      });

      mountedView = new core.EditorView({
        parent,
        state,
      });

      viewRef.current = mountedView;
      initialConfig.onMount?.(mountedView);
      mountedView.focus();
    });

    return () => {
      active = false;
      mountedView?.destroy();
      viewRef.current = null;
    };
  }, []);

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

    codeMirrorCorePromise.then((core) => {
      const compartments = getEditorCompartments(compartmentsRef, core);
      viewRef.current?.dispatch({
        effects: compartments.theme.reconfigure(
          createThemeExtension(props.theme, props.fontFamily, props.fontSize)
        ),
      });
    });
  }, [props.fontFamily, props.fontSize, props.theme]);

  useEffect(() => {
    if (!viewRef.current) {
      return;
    }

    codeMirrorCorePromise.then((core) => {
      const compartments = getEditorCompartments(compartmentsRef, core);
      viewRef.current?.dispatch({
        effects: compartments.behavior.reconfigure(
          createBehaviorExtensions(core, {
            lineNumbers: props.lineNumbers,
            syntaxHighlighting: props.syntaxHighlighting,
            tabSize: props.tabSize,
            wordWrap: props.wordWrap,
          })
        ),
      });
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

    Promise.all([
      codeMirrorCorePromise,
      createLanguageSupport(props.language, props.syntaxHighlighting),
    ]).then(([core, languageSupport]) => {
      if (!(active && viewRef.current)) {
        return;
      }

      const compartments = getEditorCompartments(compartmentsRef, core);
      viewRef.current.dispatch({
        effects: compartments.language.reconfigure(languageSupport),
      });
    });

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

export function CodeEditorImplementation(props: CodeEditorProps) {
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
