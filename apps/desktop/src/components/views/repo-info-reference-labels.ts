import type { RepositoryStash } from "@/stores/repo/repo-store-types";

const STASH_WITH_BRANCH_PATTERN = /^(?:WIP\s+on|On)\s+(.+?)(?::\s*(.*))?$/i;

interface ParsedStashLabel {
  branchName: string;
  message: string;
}

export function parseStashLabel(message: string): ParsedStashLabel | null {
  const parsedMessage = STASH_WITH_BRANCH_PATTERN.exec(message.trim());

  if (!parsedMessage) {
    return null;
  }

  const branchName = parsedMessage[1]?.trim();
  const stashMessage = parsedMessage[2]?.trim() ?? "";

  if (!branchName) {
    return null;
  }

  return {
    branchName,
    message: stashMessage,
  };
}

export function formatStashLabel(
  stash: Pick<RepositoryStash, "message" | "ref">
): string {
  const rawMessage = stash.message.trim();

  if (rawMessage.length === 0) {
    return stash.ref;
  }

  const parsedMessage = parseStashLabel(rawMessage);

  if (!parsedMessage) {
    return rawMessage;
  }

  if (parsedMessage.message.length > 0) {
    return `${parsedMessage.message} on: ${parsedMessage.branchName}`;
  }

  return rawMessage;
}

export function normalizeCommitRefLabel(rawReference: string): string | null {
  const trimmedReference = rawReference.trim();

  if (trimmedReference.length === 0) {
    return null;
  }

  const headSeparatorIndex = trimmedReference.indexOf("->");

  if (headSeparatorIndex >= 0) {
    const targetReference = trimmedReference
      .slice(headSeparatorIndex + 2)
      .trim();

    return targetReference.length > 0 ? targetReference : null;
  }

  if (trimmedReference.startsWith("tag: ")) {
    const tagName = trimmedReference.slice("tag: ".length).trim();
    return tagName.length > 0 ? tagName : null;
  }

  if (trimmedReference === "HEAD") {
    return null;
  }

  return trimmedReference;
}

export function resolveTagNameFromCommitRef(
  rawReference: string
): string | null {
  const trimmedReference = rawReference.trim();

  if (!trimmedReference.startsWith("tag: ")) {
    return null;
  }

  return normalizeCommitRefLabel(trimmedReference);
}
