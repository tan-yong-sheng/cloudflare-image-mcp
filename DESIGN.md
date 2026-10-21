---
version: alpha
name: Cloudflare AI Image Generator
description: Visual design language and design tokens for Cloudflare AI Image Generator web UI
omitted:
  - section: spacing
    reason: "No global spacing token variables defined in frontend.ts; layout relies on standard Tailwind utility spacing."
colors:
  primary: "#5046e5"
  primary-light: "#6e67eb"
  primary-dark: "#4338ca"
  secondary: "#f0f4f8"
  text: "#1a202c"
  text-light: "#4a5568"
  background: "#ffffff"
  card-bg: "#f7fafc"
  border: "#e2e8f0"
  success: "#10b981"
  error: "#ef4444"
  warning: "#f59e0b"
  info: "#3b82f6"
typography:
  sans:
    fontFamily: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif
  body:
    fontFamily: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif
    fontSize: 16px
    lineHeight: 1.5
    fontWeight: 400
  h1:
    fontFamily: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif
    fontSize: 24px
    lineHeight: 2rem
    fontWeight: 700
  h2:
    fontFamily: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif
    fontSize: 18px
    lineHeight: 1.75rem
    fontWeight: 600
  label:
    fontFamily: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif
    fontSize: 14px
    lineHeight: 1.25rem
    fontWeight: 500
rounded:
  base: 0.375rem
  card: 0.5rem
---

## Overview

The Cloudflare AI Image Generator interface provides a single-page web generator for prompt-driven image generation powered by Workers AI models.

## Colors

The interface uses an indigo primary palette for brand actions, state transitions, and interactive highlights, paired with neutral surfaces for text and card containment.

- **Primary (`#5046e5`):** Applied to primary submit buttons, range slider thumbs, and section icon accents.
- **Secondary (`#f0f4f8`):** Low-contrast neutral used for secondary button backgrounds.
- **Text (`#1a202c`):** High-contrast neutral for readable headings, labels, and primary copy.
- **Card Background (`#f7fafc`):** Soft surface background separating grouped input controls and image preview containers from the page backdrop.
- **Border (`#e2e8f0`):** Structural boundary lines on inputs, cards, and dividers.
- **Feedback Accents:** Inline validation errors render in Tailwind red-500 (`#ef4444`), matching the defined `error` token value. The `success`, `warning`, and `info` tokens are defined in the token block but have no current consumer in the markup.

## Themes

The interface supports Light and Dark modes toggled via the `#themeToggle` button. Dark mode activates when the root document carries the `.dark` class.

| Semantic Token  | Light Mode (Default) | Dark Mode (`.dark`) | Application Role                                           |
| :-------------- | :------------------- | :------------------ | :--------------------------------------------------------- |
| `primary`       | `#5046e5`            | `#6e67eb`           | Primary action buttons, active slider thumbs, icon accents |
| `primary-light` | `#6e67eb`            | `#8a84ee`           | Hover state for primary buttons                            |
| `primary-dark`  | `#4338ca`            | `#5046e5`           | Active/pressed state for primary buttons                   |
| `secondary`     | `#f0f4f8`            | `#2d3748`           | Secondary button backgrounds (no other current consumer)   |
| `text`          | `#1a202c`            | `#f7fafc`           | Primary copy, titles, field labels                         |
| `text-light`    | `#4a5568`            | `#cbd5e0`           | Secondary copy, metadata, helper text                      |
| `background`    | `#ffffff`            | `#111827`           | Base page canvas background                                |
| `card-bg`       | `#f7fafc`            | `#1f2937`           | Content cards, modal dialogs, output containers            |
| `border`        | `#e2e8f0`            | `#374151`           | Element borders, dividers, input outlines                  |
| `success`       | `#10b981`            | `#10b981`           | Defined token, no current consumer                         |
| `error`         | `#ef4444`            | `#ef4444`           | Validation error text, failure alert banners               |
| `warning`       | `#f59e0b`            | `#f59e0b`           | Defined token, no current consumer                         |
| `info`          | `#3b82f6`            | `#3b82f6`           | Defined token, no current consumer                         |

## Typography

Typography relies on the native system sans font stack to ensure zero-latency rendering without external web-font requests.

- **Page Titles (`h1`):** 24px bold font used for the page title, stepping up one Tailwind size step at the md breakpoint. The login dialog title uses the same 24px bold styling on an `h2` element.
- **Section Headings (`h2`):** 18px semi-bold font used for panel titles with leading icons.
- **Body (`body`):** 16px regular font for form controls and instructions.
- **Labels (`label`):** 14px medium font used for form field labels.

## Layout

The page layout centers content within a fixed-max-width container with responsive padding (a custom `1200px` cap at `min-width: 1024px` overrides the `max-w-6xl` utility):

- **Two-Column Desktop Split:** At the lg breakpoint and above, controls reside in a 2/5 width column and results reside in a 3/5 width column.
- **Stacked Mobile Flow:** Below the lg breakpoint, columns collapse vertically to maintain full-width tap targets.

## Elevation & Depth

Depth is conveyed through subtle tonal borders paired with two-level box shadows:

- **Card Resting State:** Surface containment with `box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1)` and a 1px border.
- **Card Hover State:** Interactive lift with `box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)`.
- **Modal Overlay:** Backdrop dimming using `rgba(0, 0, 0, 0.5)` with a centered elevated dialog.

## Shapes

Soft, consistent radii define container and interactive boundaries:

- **Interactive Controls (`rounded.base`):** `0.375rem` (6px) applied to `.btn`, `input`, `select`, and `textarea`.
- **Containers (`rounded.card`):** `0.5rem` (8px) applied to `.card`, image container, and overlay masks.

## Components

- **Buttons:** Primary (`.btn-primary`) uses `{colors.primary}` with white text and lifts on hover; secondary (`.btn-secondary`) uses `{colors.secondary}` with a `{colors.border}` outline. Buttons suppress the default focus outline but restore a `2px solid` `{colors.primary}` `:focus-visible` ring.
- **Cards:** Grouped input panels and results use `.card` with `{colors.card-bg}` and `{rounded.card}`.
- **Modals:** A single centered login dialog (`#loginModal`) renders over a dimmed full-viewport backdrop and is dismissed once session auth is present.
- **Provider Brand Marks:** A provider family is identified by its own mark next to the family name, in the workbench rail and in the key-table heading. Cloudflare uses the Font Awesome `fa-cloudflare` glyph; Agnes uses the vendor's app icon, inlined as a data URI (`workers/src/config/brand.ts`) so the mark adds no new third-party origin — the page's only external requests remain the two stylesheet CDNs it has always loaded. The mark is sized in `em` via `.family-mark` so it tracks the family name's font-size, and it is decorative — `alt=""` and `aria-hidden="true"`, because the family name is always rendered as text beside it. The raster is a fixed-colour brand asset and does not invert with the theme, so it reads at full contrast on the light card and at lower contrast on the dark card; the mark is decorative and the name carries the meaning, so it is left unrestyled rather than restyled away from the vendor's brand.

## Do's and Don'ts

- Do preserve the distinct focus treatments: the `:focus-visible` outline on buttons and the `:focus` ring on form inputs.
- Do reference CSS custom properties rather than hardcoded hex values when styling against theme tokens.
