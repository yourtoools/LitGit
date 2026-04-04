import { defaultKeymap, historyKeymap } from "@codemirror/commands";
import type { Extension } from "@codemirror/state";
import { keymap } from "@codemirror/view";

export function createEditKeymap(onSave: () => void): Extension {
  return keymap.of([
    {
      key: "Mod-s",
      preventDefault: true,
      run: () => {
        onSave();
        return true;
      },
    },
    ...defaultKeymap,
    ...historyKeymap,
  ]);
}

export function createReadOnlyKeymap(): Extension {
  return keymap.of([
    // Allow selection and navigation but no editing
    {
      key: "Delete",
      run: () => true,
    },
    {
      key: "Backspace",
      run: () => true,
    },
    {
      key: "Enter",
      run: () => true,
    },
    {
      key: "Mod-a",
      run: () => false, // Allow select all
    },
    {
      key: "Mod-c",
      run: () => false, // Allow copy
    },
  ]);
}
