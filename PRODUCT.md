# Product

## Register

product

## Users

LitGit is for developers who work with local Git repositories and want a desktop-native workspace for repository inspection, branch work, authentication, diffs, commits, publishing, settings, and integrated terminal flows. They are often in focused engineering sessions: reviewing changes before a commit, checking history, resolving auth prompts, comparing files, opening a repository in an external editor, or tuning local Git and AI commit-generation settings.

The primary user values speed, trust, keyboard access, dense information, native platform behavior, and clear recovery paths when Git, OAuth, SSH, or provider operations fail.

## Product Purpose

LitGit makes Git repository work feel local, legible, and controlled. It wraps complex Git and provider interactions in a desktop surface that keeps context visible: recent repositories, branch state, file changes, commit history, auth status, diff previews, settings, and launcher actions.

Success means a developer can understand the state of a repository quickly, take an action with confidence, and recover from edge cases without leaving the app unless a native tool is the better place to continue.

## Brand Personality

Precise, native, quietly capable.

The tone should feel like an expert desktop tool that respects the user's operating system and habits. It should be calm under pressure, explicit about state, and direct in copy. It can have craft and personality through details, but the interface should never perform for attention while the user is trying to make a Git decision.

## Anti-references

Avoid generic SaaS dashboards, marketing-page polish inside product views, oversized empty-state theatrics, neon developer aesthetics, glassmorphism, heavy gradients, rounded card grids, and modal-first flows for ordinary tasks.

Avoid making Git feel playful or vague. Do not hide destructive or remote-affecting actions behind cute language. Do not imitate heavyweight IDE chrome when the app can be more focused and native.

## Design Principles

1. Keep repository state visible. Branches, changes, history, auth status, and selected context should stay close to the action they affect.
2. Prefer native confidence. Platform conventions, keyboard behavior, file managers, terminals, and external editors should feel respected rather than abstracted away.
3. Make risky actions explicit. Destructive, remote, auth, and publishing flows need clear labels, scoped consequences, and recoverable confirmation patterns.
4. Optimize for focused density. Use compact controls and stable panes so repeated Git work remains fast without feeling cramped or brittle.
5. Let craft show through precision. Small focus states, resize handles, typography, and state transitions should feel considered, not decorative.

## Accessibility & Inclusion

Target WCAG 2.2 AA for contrast, focus visibility, keyboard navigation, and form labeling. The app should remain usable for keyboard-first developers and users who rely on screen readers, reduced motion, high contrast, or system theme preferences.

Motion should honor `prefers-reduced-motion`. Color must not be the only carrier of Git state, validation, destructive risk, or provider connection status. Dense panes should keep hit targets and focus indicators clear enough for repeated use.
