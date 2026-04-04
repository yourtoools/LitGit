import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { type ReactNode, useMemo } from "react";
import {
  type MarkdownBlock,
  parseMarkdownBlocks,
} from "@/components/views/repo-info/diff-workspace-markdown-preview-parser";

interface DiffWorkspaceMarkdownPreviewSurfaceProps {
  markdown: string;
}

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
      nodes.push(
        <strong key={`inline-strong-${tokenStart}-${token}`}>
          {renderInlineMarkdown(token.slice(2, -2))}
        </strong>
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(
        <em key={`inline-em-${tokenStart}-${token}`}>
          {renderInlineMarkdown(token.slice(1, -1))}
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

function renderMarkdownBlock(block: MarkdownBlock, index: number): ReactNode {
  if (block.kind === "code") {
    return (
      <pre
        className="my-6 overflow-auto border border-border/70 bg-muted/30 px-4 py-3"
        key={`code-block-${index}`}
      >
        {block.language.length > 0 ? (
          <div className="mb-2 text-[0.68rem] text-muted-foreground uppercase tracking-wide">
            {block.language}
          </div>
        ) : null}
        <code className="font-mono text-sm leading-6">{block.content}</code>
      </pre>
    );
  }

  if (block.kind === "heading") {
    const headingContent = renderInlineMarkdown(block.text);
    const headingClassNameByLevel: Record<number, string> = {
      1: "scroll-m-20 text-4xl font-extrabold tracking-tight text-balance",
      2: "mt-10 scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight transition-colors first:mt-0",
      3: "mt-8 scroll-m-20 text-2xl font-semibold tracking-tight",
      4: "mt-8 scroll-m-20 text-xl font-semibold tracking-tight",
      5: "mt-8 scroll-m-20 text-lg font-semibold tracking-tight",
      6: "mt-8 scroll-m-20 text-base font-semibold tracking-tight",
    };
    const headingClassName =
      headingClassNameByLevel[block.level] ??
      "mt-8 scroll-m-20 text-base font-semibold tracking-tight";

    if (block.level === 1) {
      return (
        <h1 className={headingClassName} key={`heading-${index}`}>
          {headingContent}
        </h1>
      );
    }

    if (block.level === 2) {
      return (
        <h2 className={headingClassName} key={`heading-${index}`}>
          {headingContent}
        </h2>
      );
    }

    if (block.level === 3) {
      return (
        <h3 className={headingClassName} key={`heading-${index}`}>
          {headingContent}
        </h3>
      );
    }

    if (block.level === 4) {
      return (
        <h4 className={headingClassName} key={`heading-${index}`}>
          {headingContent}
        </h4>
      );
    }

    if (block.level === 5) {
      return (
        <h5 className={headingClassName} key={`heading-${index}`}>
          {headingContent}
        </h5>
      );
    }

    return (
      <h6 className={headingClassName} key={`heading-${index}`}>
        {headingContent}
      </h6>
    );
  }

  if (block.kind === "unordered-list") {
    return (
      <ul
        className="my-6 ml-6 list-disc [&>li]:mt-2"
        key={`unordered-list-${index}`}
      >
        {block.items.map((item) => (
          <li key={`unordered-list-item-${index}-${item}`}>
            {renderInlineMarkdown(item)}
          </li>
        ))}
      </ul>
    );
  }

  if (block.kind === "ordered-list") {
    return (
      <ol
        className="my-6 ml-6 list-decimal [&>li]:mt-2"
        key={`ordered-list-${index}`}
      >
        {block.items.map((item) => (
          <li key={`ordered-list-item-${index}-${item}`}>
            {renderInlineMarkdown(item)}
          </li>
        ))}
      </ol>
    );
  }

  if (block.kind === "blockquote") {
    return (
      <blockquote
        className="mt-6 border-l-2 pl-6 italic"
        key={`blockquote-${index}`}
      >
        {renderInlineMarkdown(block.content)}
      </blockquote>
    );
  }

  return (
    <p
      className="leading-7 [&:not(:first-child)]:mt-6"
      key={`paragraph-${index}`}
    >
      {renderInlineMarkdown(block.text)}
    </p>
  );
}

export function DiffWorkspaceMarkdownPreviewSurface({
  markdown,
}: DiffWorkspaceMarkdownPreviewSurfaceProps) {
  const normalized =
    markdown.trim().length === 0 ? "_(Empty markdown file)_" : markdown;
  const renderedBlocks = useMemo(
    () => parseMarkdownBlocks(normalized).map(renderMarkdownBlock),
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
