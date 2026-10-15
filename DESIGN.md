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
    lineHeight: 1.25
    fontWeight: 700
  h2:
    fontFamily: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif
    fontSize: 20px
    lineHeight: 1.3
    fontWeight: 600
rounded:
  base: 0.375rem
  card: 0.5rem
---

## Overview

The Cloudflare AI Image Generator interface provides a single-page web generator for prompt-driven image generation powered by Workers AI models.

## Colors

The interface uses an indigo primary palette for brand actions, state transitions, and interactive highlights, paired with neutral surfaces for text and card containment.

- **Primary (`#5046e5`):** Applied to primary submit buttons, active tab indicators, slider thumbs, and section icon accents.
- **Secondary (`#f0f4f8`):** Low-contrast utilitarian neutral used for secondary buttons and muted backgrounds.
- **Text (`#1a202c`):** High-contrast neutral for readable headings, labels, and primary copy.
- **Card Background (`#f7fafc`):** Soft surface background separating grouped input controls and image preview containers from the page backdrop.
- **Border (`#e2e8f0`):** Structural boundary lines on inputs, cards, and dividers.
- **Feedback Accents:** State-specific alerts use semantic tokens: success (`#10b981`), error (`#ef4444`), warning (`#f59e0b`), and info (`#3b82f6`).

## Themes

The interface supports Light and Dark modes toggled via the `#themeToggle` button. Dark mode activates when the root document carries the `.dark` class.

| Semantic Token  | Light Mode (Default) | Dark Mode (`.dark`) | Application Role                                           |
| :-------------- | :------------------- | :------------------ | :--------------------------------------------------------- |
| `primary`       | `#5046e5`            | `#6e67eb`           | Primary action buttons, active slider thumbs, icon accents |
| `primary-light` | `#6e67eb`            | `#8a84ee`           | Hover state for primary buttons                            |
| `primary-dark`  | `#4338ca`            | `#5046e5`           | Active/pressed state for primary buttons                   |
| `secondary`     | `#f0f4f8`            | `#2d3748`           | Secondary button backgrounds, pill badges                  |
| `text`          | `#1a202c`            | `#f7fafc`           | Primary copy, titles, field labels                         |
| `text-light`    | `#4a5568`            | `#cbd5e0`           | Secondary copy, metadata, helper text                      |
| `background`    | `#ffffff`            | `#111827`           | Base page canvas background                                |
| `card-bg`       | `#f7fafc`            | `#1f2937`           | Content cards, modal dialogs, output containers            |
| `border`        | `#e2e8f0`            | `#374151`           | Element borders, dividers, input outlines                  |
| `success`       | `#10b981`            | `#10b981`           | Success alerts, copy-to-clipboard confirmation             |
| `error`         | `#ef4444`            | `#ef4444`           | Validation error text, failure alert banners               |
| `warning`       | `#f59e0b`            | `#f59e0b`           | Model capability notices, warning badges                   |
| `info`          | `#3b82f6`            | `#3b82f6`           | Informational callouts and guidance                        |

## Typography

Typography relies on the native system sans font stack to ensure zero-latency rendering without external web-font requests.

- **Primary Headings (`h1`):** 24px bold font used for page titles and modal dialog titles.
- **Section Headings (`h2`):** 20px semi-bold font used for panel titles with leading icons.
- **Body (`body`):** 16px regular font for form controls and instructions.

## Layout

The page layout centers content within a fixed-max-width container (`max-w-6xl` / 1200px) with responsive padding:

- **Two-Column Desktop Split:** When viewport is 1024px or wider, controls reside in a 2/5 width column and results reside in a 3/5 width column.
- **Stacked Mobile Flow:** On viewports below 768px, columns collapse vertically to maintain full-width tap targets.

## Elevation & Depth

Depth is conveyed through subtle tonal borders paired with two-level box shadows:

- **Card Resting State:** Surface containment with `box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1)` and a 1px border.
- **Card Hover State:** Interactive lift with `box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1)`.
- **Modal Overlay:** Backdrop dimming using `rgba(0, 0, 0, 0.5)` with centered elevation dialog.

## Shapes

Soft, consistent radii define container and interactive boundaries:

- **Interactive Controls (`rounded.base`):** `0.375rem` (6px) applied to `.btn`, `input`, `select`, and `textarea`.
- **Containers (`rounded.card`):** `0.5rem` (8px) applied to `.card`, image container, and overlay masks.

## Components

- **Buttons:** Primary (`.btn-primary`) uses `{colors.primary}` with white text; secondary (`.btn-secondary`) uses `{colors.secondary}` with `{colors.border}` outline. Both enforce `:focus-visible` with `outline: 2px solid var(--primary)`.
- **Cards:** Grouped input panels and results use `.card` with `{colors.card-bg}` and `{rounded.card}`.
- **Modals:** Centered dialog containers use `#loginModal` and `#adminModal` with darkened backdrop and focus isolation.

## Do's and Don'ts

- Do apply `:focus-visible` consistently across both buttons and form inputs.
- Do use CSS custom properties (`var(--primary)`, `var(--card-bg)`) rather than hardcoded hex values in inline styles.
- Don't use outline-none without providing an accessible focus indicator.
