# ADR-003: Model Config Codegen (`models.json` → `models.generated.ts`)

## Status

Accepted

## Date

2026-10-18

## Context

`workers/src/config/models.json` has been the declared source of truth for the
model registry, and `workers/src/config/models.ts` carried a hand-written mirror
of it. The mirror is where a model's _rationale_ lived — a probe that found the
provider ignoring `width`/`height`, a `step: 64` no Cloudflare page publishes —
while the JSON carried only the values.

The seam between the two was a test. `models.test.ts` checked the id set, the
transport key (C4), and three parameter fields (`description`, `default`,
`required`). Everything else a model entry can express was unguarded:

- `limits` (all eight fields, `supportedSizes` included), `min`/`max`/`step`,
  `provider`, `apiVersion`, `inputFormat`, `responseFormat`, `supportedTasks`,
  `maxInputImages`, `editCapabilities`, and `exposure` could drift in either
  direction with no red test.
- `.opencodereview/rule.json` carried a review-time rule ("flag any model field
  present in one but not the other") for the same gap: the mirror's consistency
  was partly enforced by a reviewer's attention.

Adding a model meant making the same edit twice, and ADR-002 made the second
copy load-bearing: `inferenceProvider` in the mirror decides which transport
serves a model, and a bad value throws at module init.

## Decision

Generate the TypeScript registry from the JSON, and keep the JSON the only place
a model is declared.

1. **`scripts/generate-models.mjs` projects the registry.** It reads
   `models.json` and writes `models.generated.ts`. The output is committed, so a
   model change is reviewable as an ordinary diff and neither `tsc` nor the
   bundler needs a codegen step.
2. **The projection is total.** Every key of every model entry is carried
   through verbatim; the only exception is the `$comment` documentation key,
   which becomes a `//` comment. There is no field whitelist to fall behind.
3. **Data in the generated file, behaviour in `models.ts`.** `resolveModelId`,
   `isModelExposed`, `getModelConfig`, `listModels`, and `DEFAULT_MODEL` stay
   hand-written; `models.ts` re-exports `MODEL_CONFIGS` from the generated
   module, so every import site is unchanged.
4. **Two invariants, enforced by the generator itself.** `--check` fails when
   the committed file differs from the rendering, and every run asserts the
   printed literal evaluates back to the JSON it came from (`$comment`
   excepted). The round trip is what catches a projection bug that drops an
   optional field; `tsc` catches a missing required one or an excess key,
   because the emitted literal is annotated `Record<string, ModelConfig>`.
5. **The gate lives in `npm run check`.** CI's Fast checks and the deploy
   workflow both already run it, so a stale or lossy projection reaches neither
   `main` nor production. `models.generated.ts` is `.prettierignore`d: the
   generator, not the formatter, owns its layout.
6. **Rationale moves into the JSON.** Model-level `$comment` strings carry the
   probe notes; a document-level one carries the notes that used to sit above
   the shared parameter fragments. `$comment` at any other depth is rejected
   rather than silently dropped.

## Alternatives considered

**Keep the hand-mirror and widen the tests.** Cheaper up front, but it keeps two
copies of every model and asks a test to enumerate every field — the failure
mode being replaced. The mirror covered three parameter fields; the codegen gate
covers the file.

**Generate at build time only, without committing the output.** Then `tsc`, the
bundler, and every reader would need codegen to have run first, and a drift
would stay invisible until someone rebuilt.

**Import `models.json` directly and drop TypeScript.** Deletes both the
generated file and the gate, but a JSON import widens `type` to `string` and
`apiVersion` to `number`, so entry-level type errors become runtime bugs.

**Move the registry into D1.** The right shape for an operator-managed
catalogue, but it puts a database read on the generation path and is a separate
decision.

## Consequences

### Positive

- Adding a model is one edit plus `npm run models:gen`; the second copy cannot
  fall behind because there is no second copy.
- Every field of every entry is typechecked, excess keys included, so a typo
  (`"maxSteps": "8"`) or an invented field fails `npm run check` without a new
  test.
- Rationale now lives next to the data it explains, in the file a model-adder
  opens first.
- Drift detection is total: byte equality of the whole projection, not a
  hand-listed subset of fields.
- The two JSON/TS parity tests and the `.opencodereview` drift rule are
  subsumed; the rule becomes "regenerate the projection".

### Negative

- The registry is 830 lines of generated output. A reviewer reads the JSON diff
  and trusts the generator, so the generator has to stay readable: 281 lines,
  one file, no dependencies.
- `MODEL_CONFIGS` no longer shares one object per repeated parameter shape (the
  old shared-fragment constants). Nothing depended on that identity — entries are
  read-only at runtime, and the D1 exposure overlay copies rather than mutates.
- `models.json` still carries the `modelAliases` map, which `resolveModelId`
  ignores in favour of `exposure.alias`. It is left untouched here (projecting
  it would activate a second alias mechanism); the run-time alias is
  `exposure.alias`.

## References

- ADR-002: provider transport registry (`inferenceProvider` is what made the
  mirror load-bearing)
- `scripts/generate-models.mjs`, `workers/src/config/models.json`,
  `workers/src/config/models.generated.ts`, `workers/src/config/models.ts`
- `.opencodereview/rule.json` — the drift rule replaced by the generated-file
  rule
