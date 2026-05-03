import type { Extension } from "@codemirror/state";
import { loadLanguageSupport } from "@/lib/code-editor/utils/language-resolver";

export async function createLanguageSupport(
  language: string,
  syntaxHighlighting: boolean
): Promise<Extension[]> {
  if (!syntaxHighlighting || language === "plaintext") {
    return [];
  }

  const support = await loadLanguageSupport(language);
  return Array.isArray(support) ? support : [support];
}
