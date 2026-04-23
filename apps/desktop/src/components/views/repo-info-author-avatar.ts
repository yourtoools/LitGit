import type { RepositoryCommit } from "@/stores/repo/repo-store-types";

const GITHUB_NOREPLY_EMAIL_SUFFIX = "@users.noreply.github.com";
const GITLAB_NOREPLY_EMAIL_SUFFIX = "@users.noreply.gitlab.com";
const BITBUCKET_NOREPLY_EMAIL_SUFFIX = "@users.noreply.bitbucket.org";
const ASCII_DIGITS_PATTERN = /^\d+$/;

export function isValidGitHubUsername(username: string): boolean {
  const length = username.length;
  if (length === 0 || length > 39) {
    return false;
  }

  if (username.startsWith("-") || username.endsWith("-")) {
    return false;
  }

  for (const character of username) {
    const isAlphabet =
      (character >= "a" && character <= "z") ||
      (character >= "A" && character <= "Z");
    const isDigit = character >= "0" && character <= "9";

    if (!(isAlphabet || isDigit || character === "-")) {
      return false;
    }
  }

  return true;
}

export function isValidBitbucketUsername(username: string): boolean {
  const length = username.length;
  if (length === 0 || length > 39) {
    return false;
  }

  if (username.startsWith("-") || username.startsWith("_")) {
    return false;
  }

  for (const character of username) {
    const isAlphabet =
      (character >= "a" && character <= "z") ||
      (character >= "A" && character <= "Z");
    const isDigit = character >= "0" && character <= "9";

    if (
      !(
        isAlphabet ||
        isDigit ||
        character === "-" ||
        character === "_" ||
        character === "."
      )
    ) {
      return false;
    }
  }

  return true;
}

function resolveGitHubAvatarFromIdentityEmail(
  email: string | null
): string | null {
  const normalizedEmail = email?.trim().toLowerCase() ?? "";

  if (!normalizedEmail.endsWith(GITHUB_NOREPLY_EMAIL_SUFFIX)) {
    return null;
  }

  const localPart = normalizedEmail.slice(
    0,
    -GITHUB_NOREPLY_EMAIL_SUFFIX.length
  );

  if (localPart.length === 0) {
    return null;
  }

  const plusSeparatorIndex = localPart.indexOf("+");

  if (plusSeparatorIndex >= 0) {
    const left = localPart.slice(0, plusSeparatorIndex);
    const right = localPart.slice(plusSeparatorIndex + 1);
    let username: string | null = null;

    if (isValidGitHubUsername(right)) {
      username = right;
    } else if (isValidGitHubUsername(left)) {
      username = left;
    }

    if (ASCII_DIGITS_PATTERN.test(left)) {
      return `https://avatars.githubusercontent.com/u/${left}?v=4`;
    }

    return username ? `https://github.com/${username}.png` : null;
  }

  if (isValidGitHubUsername(localPart)) {
    return `https://github.com/${localPart}.png`;
  }

  return null;
}

function resolveGitLabAvatarFromIdentityEmail(
  normalizedEmail: string
): string | null {
  if (!normalizedEmail.endsWith(GITLAB_NOREPLY_EMAIL_SUFFIX)) {
    return null;
  }

  const localPart = normalizedEmail.slice(
    0,
    -GITLAB_NOREPLY_EMAIL_SUFFIX.length
  );

  if (localPart.length === 0) {
    return null;
  }

  if (ASCII_DIGITS_PATTERN.test(localPart)) {
    return `https://secure.gravatar.com/avatar/${localPart}?s=80&d=identicon`;
  }

  return null;
}

function resolveBitbucketAvatarFromIdentityEmail(
  normalizedEmail: string
): string | null {
  if (!normalizedEmail.endsWith(BITBUCKET_NOREPLY_EMAIL_SUFFIX)) {
    return null;
  }

  const localPart = normalizedEmail.slice(
    0,
    -BITBUCKET_NOREPLY_EMAIL_SUFFIX.length
  );

  if (localPart.length === 0) {
    return null;
  }

  const colonIndex = localPart.indexOf(":");

  if (colonIndex >= 0) {
    const accountId = localPart.slice(0, colonIndex);
    const username = localPart.slice(colonIndex + 1);

    if (
      isValidBitbucketUsername(username) &&
      ASCII_DIGITS_PATTERN.test(accountId)
    ) {
      return `https://avatar-management--avatars.us-west-2.prod.public.atl-paas.net/initials/${username}-0.png`;
    }
  }

  return null;
}

export function resolveCommitAuthorAvatarFromIdentityEmail(
  email: string | null
): string | null {
  const normalizedEmail = email?.trim().toLowerCase() ?? "";

  const githubAvatar = resolveGitHubAvatarFromIdentityEmail(normalizedEmail);
  if (githubAvatar) {
    return githubAvatar;
  }

  const gitlabAvatar = resolveGitLabAvatarFromIdentityEmail(normalizedEmail);
  if (gitlabAvatar) {
    return gitlabAvatar;
  }

  const bitbucketAvatar =
    resolveBitbucketAvatarFromIdentityEmail(normalizedEmail);
  if (bitbucketAvatar) {
    return bitbucketAvatar;
  }

  return null;
}

export function resolveWipAuthorAvatarUrl(
  commits: RepositoryCommit[],
  identityEmail: string | null,
  identityName: string | null
): string | null {
  const normalizedIdentityEmail = identityEmail?.trim().toLowerCase() ?? "";

  if (normalizedIdentityEmail.length > 0) {
    for (const commit of commits) {
      if (!(commit.authorAvatarUrl && commit.authorEmail)) {
        continue;
      }

      if (commit.authorEmail.trim().toLowerCase() === normalizedIdentityEmail) {
        return commit.authorAvatarUrl;
      }
    }
  }

  const normalizedIdentityName = identityName?.trim().toLowerCase() ?? "";

  if (normalizedIdentityName.length > 0) {
    for (const commit of commits) {
      if (!commit.authorAvatarUrl) {
        continue;
      }

      if (commit.author.trim().toLowerCase() === normalizedIdentityName) {
        return commit.authorAvatarUrl;
      }
    }
  }

  return resolveCommitAuthorAvatarFromIdentityEmail(identityEmail);
}
