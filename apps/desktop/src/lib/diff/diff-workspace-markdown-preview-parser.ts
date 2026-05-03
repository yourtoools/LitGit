export type MarkdownBlock =
  | { content: string; kind: "blockquote" }
  | { content: string; kind: "code"; language: string }
  | { kind: "heading"; level: number; text: string }
  | { items: string[]; kind: "ordered-list" }
  | { kind: "paragraph"; text: string }
  | { items: string[]; kind: "unordered-list" };

const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/;
const ORDERED_LIST_PATTERN = /^\s*\d+\.\s+(.+)$/;
const UNORDERED_LIST_PATTERN = /^\s*[-*+]\s+(.+)$/;
const BLOCKQUOTE_PATTERN = /^\s*>\s?(.*)$/;
const FENCE_PATTERN = /^(```|~~~)(.*)$/;
const WHITESPACE_PATTERN = /\s+/;

function isBlockBoundary(line: string): boolean {
  return (
    line.trim().length === 0 ||
    HEADING_PATTERN.test(line) ||
    ORDERED_LIST_PATTERN.test(line) ||
    UNORDERED_LIST_PATTERN.test(line) ||
    BLOCKQUOTE_PATTERN.test(line) ||
    FENCE_PATTERN.test(line)
  );
}

function parseFenceInfo(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return "";
  }

  const [language = ""] = trimmed.split(WHITESPACE_PATTERN, 1);
  return language.trim();
}

export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      index += 1;
      continue;
    }

    const fenceMatch = FENCE_PATTERN.exec(line);

    if (fenceMatch) {
      const marker = fenceMatch[1] ?? "```";
      const language = parseFenceInfo(fenceMatch[2] ?? "");
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length) {
        const candidate = lines[index] ?? "";

        if (candidate.trimStart().startsWith(marker)) {
          index += 1;
          break;
        }

        codeLines.push(candidate);
        index += 1;
      }

      blocks.push({
        content: codeLines.join("\n"),
        kind: "code",
        language,
      });
      continue;
    }

    const headingMatch = HEADING_PATTERN.exec(line);

    if (headingMatch) {
      blocks.push({
        kind: "heading",
        level: Math.min(6, headingMatch[1]?.length ?? 1),
        text: headingMatch[2] ?? "",
      });
      index += 1;
      continue;
    }

    if (UNORDERED_LIST_PATTERN.test(line)) {
      const items: string[] = [];

      while (index < lines.length) {
        const candidate = lines[index] ?? "";
        const match = UNORDERED_LIST_PATTERN.exec(candidate);

        if (!match) {
          break;
        }

        items.push(match[1] ?? "");
        index += 1;
      }

      blocks.push({ items, kind: "unordered-list" });
      continue;
    }

    if (ORDERED_LIST_PATTERN.test(line)) {
      const items: string[] = [];

      while (index < lines.length) {
        const candidate = lines[index] ?? "";
        const match = ORDERED_LIST_PATTERN.exec(candidate);

        if (!match) {
          break;
        }

        items.push(match[1] ?? "");
        index += 1;
      }

      blocks.push({ items, kind: "ordered-list" });
      continue;
    }

    if (BLOCKQUOTE_PATTERN.test(line)) {
      const quoteLines: string[] = [];

      while (index < lines.length) {
        const candidate = lines[index] ?? "";
        const match = BLOCKQUOTE_PATTERN.exec(candidate);

        if (!match) {
          break;
        }

        quoteLines.push(match[1] ?? "");
        index += 1;
      }

      blocks.push({
        content: quoteLines.join(" "),
        kind: "blockquote",
      });
      continue;
    }

    const paragraphLines: string[] = [];

    while (index < lines.length) {
      const candidate = lines[index] ?? "";

      if (isBlockBoundary(candidate)) {
        break;
      }

      paragraphLines.push(candidate);
      index += 1;
    }

    if (paragraphLines.length > 0) {
      blocks.push({
        kind: "paragraph",
        text: paragraphLines.join(" "),
      });
      continue;
    }

    index += 1;
  }

  return blocks;
}
