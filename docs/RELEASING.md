# Cutting a release

How a maintainer ships a versioned release. Mechanism lives in
`.github/workflows/tag-release.yml` (read its header for trigger and
idempotency details); why it looks that way lives in
`docs/research/release-mechanism-photocraft.md` and issue #8. This file
is the procedure, nothing else.

## Decide the version

Bump by what changed since the last release, not by feeling:

| Change                                                                               | Bump  | Example           |
| ------------------------------------------------------------------------------------ | ----- | ----------------- |
| Breaking change (endpoint removed/renamed, envelope reshaped, auth behavior changed) | MAJOR | `0.1.0` → `1.0.0` |
| New feature, backward-compatible (new endpoint, param, model)                        | MINOR | `0.1.0` → `0.2.0` |
| Bug fix only, no new surface                                                         | PATCH | `0.1.0` → `0.1.1` |

`0.x` caveat: major-version-zero promises nothing — treat `0.0.x` as
PATCH-level and `0.x.0` as MINOR-level, and go `1.0.0` when you'd stake
compatibility on it. Versions move forward only from the `0.1.0`
manifest baseline (never released, but in history — don't go below it).

A `-rc.1` / `-beta.2` suffix marks a _candidate_ for the bare version,
not a version itself: `0.2.0-rc.1 < 0.2.0` always. Cut the RC first,
verify it, then release the bare version. Suggested first line:
`0.2.0-rc.1` → `0.2.0`.

## Cut the release

1. **PR bumping `workers/package.json` `version`** through normal
   review, then merge. This is the only manual step — the workflow mints
   the tag and Release from the push. Never hand-tag.
2. **Watch the `tag-release.yml` run** on the merge commit. It resolves
   the version, validates strict semver (fails loudly on mismatch),
   then creates tag `v<semver>` + Release titled
   `cloudflare-image-mcp v<semver>` with generated notes (`--prerelease`
   iff the version has a `-` suffix).
3. **Verify the tag + Release** appear on the repo's Releases page.

## Release candidates

Same flow with a suffixed version (`0.2.0-rc.1`): the Release is marked
prerelease automatically. Verify against it (smoke tests, canary tier),
then bump to the bare version (`0.2.0`) in a second PR for the full
release. The RC stays published as pre-release history.

## When something looks wrong

- **Re-ran or re-pushed and nothing happened:** expected — re-pushing
  the same version is a no-op by design (existence checks gate creation;
  published releases are never retargeted). Check the run's step summary
  for the "already released" line.
- **Transient failure left a version half-minted:** use the workflow's
  `workflow_dispatch` (Actions → Tag release → Run workflow) as a
  backfill — no empty commit needed, no version override (re-push
  instead; the run takes seconds).
- **Two version bumps in rapid succession:** runs serialize on a
  concurrency group; the second waits, sees the first's tag, and either
  mints its own (different version) or no-ops (same version).

## What phase 1 does not do

No `release` branch, no draft stage, no approval gate, no tag-gated
deploy — every merge to `main` still deploys as today. Those belong to
phase 2 (issue #8: tag-gated deploy, persistent staging, environment
protection), alongside PR #13's gate hardening. To deploy without
releasing, merge anything that doesn't touch `workers/package.json`.
