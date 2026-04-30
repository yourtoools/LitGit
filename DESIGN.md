---
name: LitGit
description: Desktop-native Git workspace for focused repository work
colors:
  light-background: "oklch(0.985 0.002 95)"
  light-foreground: "oklch(0.31 0.028 95)"
  light-card: "oklch(0.99 0.001 95)"
  light-border: "oklch(0.88 0.005 95)"
  dark-background: "oklch(0.21 0.012 250)"
  dark-foreground: "oklch(0.85 0.02 95)"
  dark-card: "oklch(0.23 0.014 250)"
  dark-border: "oklch(0.32 0.018 250)"
  primary: "oklch(0.65 0.13 250)"
  primary-light: "oklch(0.55 0.145 250)"
  destructive: "oklch(0.6 0.16 25)"
  focus-border: "oklch(0.76 0.05 225)"
typography:
  headline:
    fontFamily: "JetBrains Mono Variable, JetBrains Mono, monospace"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Geist Variable, Geist, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.4
  body:
    fontFamily: "Geist Variable, Geist, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist Variable, Geist, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.35
rounded:
  none: "0px"
  control: "0px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.dark-background}"
    rounded: "{rounded.control}"
    height: "28px"
    padding: "0 12px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.dark-foreground}"
    rounded: "{rounded.control}"
    height: "28px"
    padding: "0 8px"
  input-compact:
    backgroundColor: "transparent"
    textColor: "{colors.dark-foreground}"
    rounded: "{rounded.control}"
    height: "28px"
    padding: "0 8px"
---

# Design System: LitGit

## 1. Overview

**Creative North Star: "The Native Workbench"**

LitGit should feel like a compact desktop workbench for Git decisions: precise surfaces, strong borders, stable panes, and controls that sit close to the repository state they affect. The product is dense by design, but it should feel organized rather than crowded.

The system favors restrained color, square geometry, tonal layering, and crisp focus treatment. It should reject marketing gloss, oversized showcase moments, decorative glass, neon developer tropes, and repeated card grids.

**Key Characteristics:**

- Compact app-shell layout with header, resizable work areas, footer, and modal or dialog surfaces only where interruption is justified.
- Dark mode as the default desktop experience, with a complete light theme for system preference and accessibility.
- Square, utility-first controls that feel native, exact, and fast.
- Focus states that are stronger than hover states because keyboard work is a first-class workflow.

## 2. Colors

LitGit uses warm neutral light surfaces, blue-tinted dark surfaces, and a restrained blue primary accent. Color is a state and affordance tool, not decoration.

### Primary

- **Repository Blue** (`oklch(0.65 0.13 250)` dark, `oklch(0.55 0.145 250)` light): primary actions, selected states, active navigation, rings, and chart emphasis. Use sparingly so it stays meaningful.

### Secondary

- **Focus Cyan-Blue** (`oklch(0.76 0.05 225)` dark, `oklch(0.68 0.045 225)` light): keyboard focus borders, resize-handle focus bars, and strong desktop focus fills.

### Tertiary

- **Risk Red** (`oklch(0.6 0.16 25)` dark, `oklch(0.55 0.18 25)` light): destructive actions, invalid states, and auth or repository operation errors.

### Neutral

- **Warm Paper** (`oklch(0.985 0.002 95)`): light background. Soft, not pure white.
- **Ink Olive** (`oklch(0.31 0.028 95)`): light foreground. Dark but tinted.
- **Deep Blue Graphite** (`oklch(0.21 0.012 250)`): dark background. Use as the primary desktop canvas.
- **Pale Repository Text** (`oklch(0.85 0.02 95)`): dark foreground with enough warmth to avoid sterile blue-gray.
- **Quiet Borders** (`oklch(0.32 0.018 250)` dark, `oklch(0.88 0.005 95)` light): pane dividers, input boundaries, list separation, and low-emphasis structure.

### Named Rules

**The State Color Rule.** Use saturated color only for primary intent, focus, risk, selected state, or data meaning. Do not add accent color just to make a section feel designed.

## 3. Typography

**Display Font:** Geist Variable, with sans-serif fallback  
**Body Font:** Geist Variable, with sans-serif fallback  
**Label/Mono Font:** JetBrains Mono Variable, with monospace fallback

**Character:** Geist keeps the app quiet and readable at small sizes. JetBrains Mono should be reserved for headings, paths, commit-like data, and code-adjacent surfaces where precision matters.

### Hierarchy

- **Display** (600, 20 to 24px, 1.2): rare. Use only for onboarding or empty states where there is no competing repository data.
- **Headline** (mono 600, 18 to 20px, 1.3): settings and major pane titles.
- **Title** (500 to 600, 14 to 16px, 1.35): dialogs, section headings, active repository labels, and toolbar groups.
- **Body** (400, 13 to 14px, 1.5): descriptions, helper copy, list metadata, and settings explanations. Cap long prose near 65 to 75 characters.
- **Label** (500, 11 to 12px, 1.35): compact controls, uppercase group labels, shortcuts, badges, and table-like metadata.

### Named Rules

**The Small Text Discipline Rule.** If a surface is operational, do not inflate type to create drama. Use spacing, borders, and state instead.

## 4. Elevation

LitGit is mostly flat. Depth comes from borders, tonal backgrounds, inset focus fills, subtle shadows, and pane structure. Shadows should support desktop layering, not imitate floating marketing cards.

### Shadow Vocabulary

- **Subtle Surface** (`0px 1px 2px 0px oklch(0.2 0.01 250 / 0.03)`): tiny separation for popovers, menus, and overlays in light mode.
- **Dark Overlay** (`0px 2px 4px 0px oklch(0.1 0.02 250 / 0.18)`): dropdowns and dialogs in dark mode.
- **Deep Modal** (`0px 24px 32px 0px oklch(0.1 0.02 250 / 0.4)`): rare, only for interruption-level overlays.

### Named Rules

**The Pane Before Card Rule.** Prefer pane divisions, resizable splitters, sticky toolbars, and inline surfaces before introducing standalone cards.

## 5. Components

### Buttons

- **Shape:** square corners (`0px`) with compact heights, usually 28px in dense toolbars and settings.
- **Primary:** Repository Blue background with tinted foreground. Use for the one action that advances the current flow.
- **Hover / Focus:** hover can use muted tonal fills. focus must use the desktop focus utilities, with inset fill and a clear border.
- **Secondary / Ghost:** transparent or muted backgrounds with icon-first affordances. Labels may appear when toolbar-label settings are enabled.

### Chips

- **Style:** compact, bordered, and low-chroma. Use for branch, status, filter, and provider metadata.
- **State:** selected chips may use primary at low opacity. Destructive or remote-risk chips must include text or icon meaning, not color alone.

### Cards / Containers

- **Corner Style:** square by default.
- **Background:** use `background`, `card`, `muted`, and `primary/2.5` style tonal layers.
- **Shadow Strategy:** flat at rest; shadow only for menus, dialogs, and overlays.
- **Border:** borders are structural and usually 1px with opacity.
- **Internal Padding:** compact panes use 8 to 12px; settings and dialogs may use 16px.

### Inputs / Fields

- **Style:** compact height, clear border, transparent or low-tint background.
- **Focus:** desktop focus utilities replace generic rings with inset fills and tinted borders.
- **Error / Disabled:** errors use Risk Red plus text. Disabled states lower opacity and preserve layout.

### Navigation

Header tabs, search, settings sections, branch selectors, and footer controls should stay compact and predictable. Active state can use Repository Blue at low opacity. Sidebar and list navigation should prefer icons plus short labels, stable row heights, and no decorative side stripes.

### Signature Component

**Diff Workspace.** The diff workspace is the product's high-density decision surface. It should keep file navigation, preview, blame, markdown preview, image comparison, terminal, and commit actions spatially stable. Avoid layout shift when switching modes; reserve space for toolbars and state indicators.

## 6. Do's and Don'ts

### Do:

- **Do** use the existing OKLCH tokens from `packages/ui/src/styles/globals.css` and `apps/desktop/src/styles/index.css`.
- **Do** keep product screens compact, pane-based, and keyboard-friendly.
- **Do** use borders, low-opacity fills, and focus utilities for structure before adding shadows.
- **Do** keep risky Git and provider actions explicit, with clear labels and recovery paths.
- **Do** honor system theme, reduced motion, and platform-native behavior.

### Don't:

- **Don't** use glassmorphism, gradient text, neon-on-black styling, or big SaaS hero metrics inside product views.
- **Don't** use colored `border-left` or `border-right` stripes as accents on cards, alerts, or list items.
- **Don't** create repeated identical card grids for settings, actions, or repository state.
- **Don't** make modals the default interaction for ordinary filtering, navigation, or progressive disclosure.
- **Don't** use pure black or pure white; keep neutrals tinted through the existing OKLCH system.
