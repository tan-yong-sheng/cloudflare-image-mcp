# Plan 001 — Remove dead presentation classes (`text-primary`, `fade-in`)

## Surface

Single-page generator at `/` (`workers/src/endpoints/frontend.ts`, served by
`serveFrontend()`, commit `f846691`).

## Evidence

- 7 usages of `text-primary` (lines 195, 232, 264, 331, icon `<i>`s) and
  `fade-in` (lines 230, 261, 328, card divs); zero definitions in `<style>`
  or Tailwind 2.2.19 utility set (`text-primary` is not a default token).
- Effect: section icons render at inherited color (not indigo `--primary`);
  cards render with no entrance animation. Same-task contradiction: the code
  declares branded icons/animated cards, the user sees unbranded/static ones.

## Change (one correction)

- Either define both classes in `<style>` (`.text-primary{color:var(--primary)}`,
  `.fade-in{animation:...}`) or delete all 7 usages. Defining preserves intent;
  deleting removes dead code. Pick defining (2 declarations, no markup churn).
- Executor: edit `frontend.ts` `<style>` only; verify by serving `/` and
  confirming computed color/animation on the 4 icons + 3 cards.

## Out of scope

Focus-ring, ARIA/labels, contrast (a11y, not requested); behavior/state work.
