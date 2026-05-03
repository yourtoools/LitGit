import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  type MarkdownBlock,
  parseMarkdownBlocks,
} from "@/lib/diff/diff-workspace-markdown-preview-parser";
import { createWorkerClient } from "@/lib/workers/create-worker-client";
import { runWorkerTask } from "@/lib/workers/run-worker-task";

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

function getInlineMarkdownNodes(value: string): ReactNode[] {
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
          {getInlineMarkdownNodes(token.slice(2, -2))}
        </strong>
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(
        <em key={`inline-em-${tokenStart}-${token}`}>
          {getInlineMarkdownNodes(token.slice(1, -1))}
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

function getMarkdownBlockKey(block: MarkdownBlock): string {
  if (block.kind === "code") {
    return `code-block-${block.language}-${block.content}`;
  }

  if (block.kind === "heading") {
    return `heading-${block.level}-${block.text}`;
  }

  if (block.kind === "blockquote") {
    return `blockquote-${block.content}`;
  }

  if (block.kind === "paragraph") {
    return `paragraph-${block.text}`;
  }

  return `${block.kind}-${block.items.join("\n")}`;
}

function getMarkdownListItemKey(item: string): string {
  return item;
}

function renderMarkdownBlock(block: MarkdownBlock): ReactNode {
  const blockKey = getMarkdownBlockKey(block);

  if (block.kind === "code") {
    return (
      <pre
        className="my-6 overflow-auto border border-border/70 bg-muted/30 px-4 py-3"
        key={blockKey}
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
    const headingContent = getInlineMarkdownNodes(block.text);
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
        <h1 className={headingClassName} key={blockKey}>
          {headingContent}
        </h1>
      );
    }

    if (block.level === 2) {
      return (
        <h2 className={headingClassName} key={blockKey}>
          {headingContent}
        </h2>
      );
    }

    if (block.level === 3) {
      return (
        <h3 className={headingClassName} key={blockKey}>
          {headingContent}
        </h3>
      );
    }

    if (block.level === 4) {
      return (
        <h4 className={headingClassName} key={blockKey}>
          {headingContent}
        </h4>
      );
    }

    if (block.level === 5) {
      return (
        <h5 className={headingClassName} key={blockKey}>
          {headingContent}
        </h5>
      );
    }

    return (
      <h6 className={headingClassName} key={blockKey}>
        {headingContent}
      </h6>
    );
  }

  if (block.kind === "unordered-list") {
    return (
      <ul className="my-6 ml-6 list-disc [&>li]:mt-2" key={blockKey}>
        {block.items.map((item) => (
          <li key={getMarkdownListItemKey(item)}>
            {getInlineMarkdownNodes(item)}
          </li>
        ))}
      </ul>
    );
  }

  if (block.kind === "ordered-list") {
    return (
      <ol className="my-6 ml-6 list-decimal [&>li]:mt-2" key={blockKey}>
        {block.items.map((item) => (
          <li key={getMarkdownListItemKey(item)}>
            {getInlineMarkdownNodes(item)}
          </li>
        ))}
      </ol>
    );
  }

  if (block.kind === "blockquote") {
    return (
      <blockquote className="mt-6 border-l-2 pl-6 italic" key={blockKey}>
        {getInlineMarkdownNodes(block.content)}
      </blockquote>
    );
  }

  return (
    <p className="leading-7 [&:not(:first-child)]:mt-6" key={blockKey}>
      {getInlineMarkdownNodes(block.text)}
    </p>
  );
}

function MarkdownPreviewArticle({ blocks }: { blocks: MarkdownBlock[] }) {
  const renderedBlocks = useMemo(
    () => blocks.map(renderMarkdownBlock),
    [blocks]
  );

  return (
    <article className="diff-workspace-markdown-preview text-foreground [&>*:first-child]:mt-0">
      {renderedBlocks}
    </article>
  );
}

export function DiffWorkspaceMarkdownPreviewSurface({
  markdown,
}: DiffWorkspaceMarkdownPreviewSurfaceProps) {
  const workerClientRef = useRef<ReturnType<
    typeof createWorkerClient<{ markdown: string }, { blocks: MarkdownBlock[] }>
  > | null>(null);
  const normalized =
    markdown.trim().length === 0 ? "_(Empty markdown file)_" : markdown;
  const [blocks, setBlocks] = useState<MarkdownBlock[]>([]);

  useEffect(() => {
    if (typeof Worker === "undefined") {
      return;
    }

    try {
      const client = createWorkerClient<
        { markdown: string },
        { blocks: MarkdownBlock[] }
      >(
        () =>
          new Worker(
            new URL(
              "./diff-workspace-markdown-preview.worker.ts",
              import.meta.url
            ),
            { type: "module" }
          )
      );
      workerClientRef.current = client;

      return () => {
        workerClientRef.current = null;
        client.dispose();
      };
    } catch {
      workerClientRef.current = null;
      return;
    }
  }, []);

  useEffect(() => {
    const workerClient = workerClientRef.current;
    let cancelled = false;

    runWorkerTask(workerClient, { markdown: normalized }, (payload) => ({
      blocks: parseMarkdownBlocks(payload.markdown),
    }))
      .then((result) => {
        if (!cancelled) {
          setBlocks(result.blocks);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBlocks([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [normalized]);

  return (
    <div className="h-full overflow-auto px-5 py-4">
      <MarkdownPreviewArticle blocks={blocks} />
    </div>
  );
}
