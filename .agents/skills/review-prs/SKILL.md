---
name: review-prs
description: Run an AI code review over one or more pull requests with the `ocr` CLI and file the report under `docs/reviews/`. Reach for this when asked to review a PR, review a stack of PRs, or re-review after review fixes.
---

# Review pull requests

`ocr` reads a Git diff and returns line-level findings. Two things make it
waste an entire run here, both fixable up front.

## Always set up these two paths first

This machine's `$HOME` is read-only to the review process, so `ocr` finishes
the review and then dies writing its session — the findings are gone. `/tmp`
is per-call ephemeral in this environment, so an `--output /tmp/...` survives
nothing.

```bash
cd <repo-worktree>
mkdir -p .tmp/ocr-home/.opencodereview
ln -sf "$HOME/.opencodereview/config.json" .tmp/ocr-home/.opencodereview/config.json
export HOME="$PWD/.tmp/ocr-home"
```

Then write results into the repo's gitignored `.tmp/`, never `/tmp`:

```bash
ocr review --audience agent --from <base> --to <head> \
  --output .tmp/ocr-<pr>.txt \
  --background "<one sentence: what the diff does and why>"
```

## Review a stack one layer at a time

For stacked PRs, run one review per layer (`--from <lower-branch> --to
<this-branch>`) rather than one review of the whole stack. A layer's findings
belong to that layer's PR; a stack-wide diff buries them.

## Follow-up rounds need a bounded budget

The default effort can run past 30 minutes with no output file and no error —
it looks hung and has to be killed. For a round after fixes, bound it:

```bash
ocr review --audience agent --effort low --timeout 10 \
  --from <fix-base> --to HEAD --output .tmp/ocr-round2.txt \
  --background "<what the fixes changed>"
```

Never re-report a finding an earlier round already fixed; compare against the
previous round's file.

## File the report

Write the final report to `docs/reviews/<date>-<subject>.md`, matching the
existing files there. A review that lives only in chat is lost with the
session.

## Delegation

A subagent is optional, not required. Inline review has been the more
reliable of the two here — subagents have stalled for hours and returned
nothing. If you do delegate, bound the scope and fall back inline rather than
waiting.
