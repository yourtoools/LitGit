import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { type ReactNode, useMemo } from "react";

interface DiffWorkspaceMarkdownPreviewSurfaceProps {
  markdown: string;
}

const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/;
const ORDERED_LIST_PATTERN = /^\s*\d+\.\s+(.+)$/;
const UNORDERED_LIST_PATTERN = /^\s*[-*+]\s+(.+)$/;
const BLOCKQUOTE_PATTERN = /^\s*>\s?(.*)$/;
const FENCE_PATTERN = /^```([\w-]+)?\s*$/;
const LINK_PATTERN = /^\[([^\]]+)\]\(([^)]+)\)$/;
const EXTERNAL_HTTP_PATTERN = /^https?:\/\//i;

function isSafeHref(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  if (normalized.length === 0) {
    return false;
  }

  const blockedPrefixes = ["data:", "file:", "javascript:", "vbscript:"];
  return !blockedPrefixes.some((prefix) => normalized.startsWith(prefix));
}

function renderInlineMarkdown(value: string): ReactNode[] {
  const inlineMarkdownPattern =
    /(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match = inlineMarkdownPattern.exec(value);

  while (match !== null) {
    const token = match[0];
    const tokenStart = match.index;
    const tokenEnd = tokenStart + token.length;

    if (tokenStart > cursor) {
      nodes.push(value.slice(cursor, tokenStart));
    }

    if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(
        <code
          className="relative bg-muted px-[0.3rem] py-[0.2rem] font-mono font-semibold text-sm"
          key={`inline-code-${tokenStart}-${token}`}
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**") && token.endsWith("**")) {
      const strongContent = token.slice(2, -2);
      nodes.push(
        <strong key={`inline-strong-${tokenStart}-${token}`}>
          {renderInlineMarkdown(strongContent)}
        </strong>
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      const emphasisContent = token.slice(1, -1);
      nodes.push(
        <em key={`inline-em-${tokenStart}-${token}`}>
          {renderInlineMarkdown(emphasisContent)}
        </em>
      );
    } else {
      const linkMatch = LINK_PATTERN.exec(token);

      if (linkMatch) {
        const [, label, href] = linkMatch;
        const isSafe = isSafeHref(href);
        const isExternal = EXTERNAL_HTTP_PATTERN.test(href.trim());

        if (isSafe) {
          nodes.push(
            <a
              className="inline-flex items-center gap-1 font-medium text-sky-400 underline underline-offset-4 hover:text-sky-300"
              href={href.trim()}
              key={`inline-link-${tokenStart}-${href}`}
              rel={isExternal ? "noopener noreferrer" : undefined}
              target={isExternal ? "_blank" : undefined}
            >
              <span>{label}</span>
              <ArrowSquareOutIcon
                aria-hidden="true"
                className="size-3.5 shrink-0"
              />
            </a>
          );
        } else {
          nodes.push(label);
        }
      } else {
        nodes.push(token);
      }
    }

    cursor = tokenEnd;
    match = inlineMarkdownPattern.exec(value);
  }

  if (cursor < value.length) {
    nodes.push(value.slice(cursor));
  }

  return nodes;
}

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

function parseMarkdownBlocks(markdown: string): ReactNode[] {
  const blocks: ReactNode[] = [];
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
      const blockStart = index;
      const language = fenceMatch[1] ?? "";
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length) {
        const candidate = lines[index] ?? "";

        if (FENCE_PATTERN.test(candidate)) {
          index += 1;
          break;
        }

        codeLines.push(candidate);
        index += 1;
      }

      blocks.push(
        <pre
          className="my-6 overflow-auto border border-border/70 bg-muted/30 px-4 py-3"
          key={`code-block-${blockStart}`}
        >
          {language.length > 0 ? (
            <div className="mb-2 text-[0.68rem] text-muted-foreground uppercase tracking-wide">
              {language}
            </div>
          ) : null}
          <code className="font-mono text-sm leading-6">
            {codeLines.join("\n")}
          </code>
        </pre>
      );
      continue;
    }

    const headingMatch = HEADING_PATTERN.exec(line);

    if (headingMatch) {
      const blockStart = index;
      const headingLevel = Math.min(6, headingMatch[1].length);
      const headingText = headingMatch[2] ?? "";
      const headingContent = renderInlineMarkdown(headingText);
      const headingClassNameByLevel: Record<number, string> = {
        1: "scroll-m-20 text-4xl font-extrabold tracking-tight text-balance",
        2: "mt-10 scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight transition-colors first:mt-0",
        3: "mt-8 scroll-m-20 text-2xl font-semibold tracking-tight",
        4: "mt-8 scroll-m-20 text-xl font-semibold tracking-tight",
        5: "mt-8 scroll-m-20 text-lg font-semibold tracking-tight",
        6: "mt-8 scroll-m-20 text-base font-semibold tracking-tight",
      };
      const headingClassName =
        headingClassNameByLevel[headingLevel] ??
        "mt-8 scroll-m-20 text-base font-semibold tracking-tight";

      let headingNode: ReactNode;

      if (headingLevel === 1) {
        headingNode = (
          <h1 className={headingClassName} key={`heading-${blockStart}`}>
            {headingContent}
          </h1>
        );
      } else if (headingLevel === 2) {
        headingNode = (
          <h2 className={headingClassName} key={`heading-${blockStart}`}>
            {headingContent}
          </h2>
        );
      } else if (headingLevel === 3) {
        headingNode = (
          <h3 className={headingClassName} key={`heading-${blockStart}`}>
            {headingContent}
          </h3>
        );
      } else if (headingLevel === 4) {
        headingNode = (
          <h4 className={headingClassName} key={`heading-${blockStart}`}>
            {headingContent}
          </h4>
        );
      } else if (headingLevel === 5) {
        headingNode = (
          <h5 className={headingClassName} key={`heading-${blockStart}`}>
            {headingContent}
          </h5>
        );
      } else {
        headingNode = (
          <h6 className={headingClassName} key={`heading-${blockStart}`}>
            {headingContent}
          </h6>
        );
      }

      blocks.push(headingNode);
      index += 1;
      continue;
    }

    if (UNORDERED_LIST_PATTERN.test(line)) {
      const blockStart = index;
      const items: Array<{ id: string; text: string }> = [];

      while (index < lines.length) {
        const candidate = lines[index] ?? "";
        const match = UNORDERED_LIST_PATTERN.exec(candidate);

        if (!match) {
          break;
        }

        const itemText = match[1] ?? "";
        items.push({
          id: `unordered-list-item-${blockStart}-${index}-${itemText}`,
          text: itemText,
        });
        index += 1;
      }

      blocks.push(
        <ul
          className="my-6 ml-6 list-disc [&>li]:mt-2"
          key={`unordered-list-${blockStart}`}
        >
          {items.map((item) => (
            <li key={item.id}>{renderInlineMarkdown(item.text)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (ORDERED_LIST_PATTERN.test(line)) {
      const blockStart = index;
      const items: Array<{ id: string; text: string }> = [];

      while (index < lines.length) {
        const candidate = lines[index] ?? "";
        const match = ORDERED_LIST_PATTERN.exec(candidate);

        if (!match) {
          break;
        }

        const itemText = match[1] ?? "";
        items.push({
          id: `ordered-list-item-${blockStart}-${index}-${itemText}`,
          text: itemText,
        });
        index += 1;
      }

      blocks.push(
        <ol
          className="my-6 ml-6 list-decimal [&>li]:mt-2"
          key={`ordered-list-${blockStart}`}
        >
          {items.map((item) => (
            <li key={item.id}>{renderInlineMarkdown(item.text)}</li>
          ))}
        </ol>
      );
      continue;
    }

    if (BLOCKQUOTE_PATTERN.test(line)) {
      const blockStart = index;
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

      blocks.push(
        <blockquote
          className="mt-6 border-l-2 pl-6 italic"
          key={`blockquote-${blockStart}`}
        >
          {renderInlineMarkdown(quoteLines.join(" "))}
        </blockquote>
      );
      continue;
    }

    const blockStart = index;
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
      blocks.push(
        <p
          className="leading-7 [&:not(:first-child)]:mt-6"
          key={`paragraph-${blockStart}`}
        >
          {renderInlineMarkdown(paragraphLines.join(" "))}
        </p>
      );
      continue;
    }

    index += 1;
  }

  return blocks;
}

export function DiffWorkspaceMarkdownPreviewSurface({
  markdown,
}: DiffWorkspaceMarkdownPreviewSurfaceProps) {
  const normalized =
    markdown.trim().length === 0 ? "_(Empty markdown file)_" : markdown;
  const renderedBlocks = useMemo(
    () => parseMarkdownBlocks(normalized),
    [normalized]
  );

  return (
    <div className="h-full overflow-auto px-5 py-4">
      <article className="diff-workspace-markdown-preview text-foreground [&>*:first-child]:mt-0">
        {renderedBlocks}
      </article>
    </div>
  );
}
