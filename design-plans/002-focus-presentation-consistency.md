# Plan 002 — Consistent focus presentation across inputs and buttons

## Surface

Same surface/commit as 001 (`workers/src/endpoints/frontend.ts`, `f846691`).

## Evidence

- Inputs/selects/textareas get a visible focus ring
  (`input:focus, select:focus, textarea:focus` ->
  `box-shadow: 0 0 0 3px rgba(80, 70, 229, 0.1)`, ~line 107-110).
- Buttons do `.btn:focus { outline: none; }` (~line 61) with no replacement.
- Same-task contradiction: tabbing through one form shows focus on fields
  and hides it on every button (Login, Generate, toggles, Download).

## Change (one correction)

- Give `.btn:focus-visible` the existing ring token:
  `box-shadow: 0 0 0 3px rgba(80, 70, 229, 0.1)` (same value inputs use --
  reuse, don't invent). `:focus-visible` (not `:focus`) so mouse clicks
  don't paint rings.
- Executor: edit `frontend.ts` `<style>` one rule; verify by keyboard-tabbing
  the page (Login -> model -> prompt -> sliders -> Generate) with no mouse.

## Out of scope

ARIA roles/labels, contrast ratios, modal focus trap (a11y layer, separate).
