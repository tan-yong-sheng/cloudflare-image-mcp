---
name: deprecate-cf-models
description: Retire a Cloudflare Workers AI image model from this repo.
disable-model-invocation: true
---

# Deprecate Cloudflare Image Model Skill

Retire a Cloudflare Workers AI image model: verify the deprecation with
evidence, remove it from the model registry, migrate callers to a live
replacement, and update docs. This is the inverse of `add-cf-models`.
Worked example: removal of `@cf/runwayml/stable-diffusion-v1-5-img2img`
(issue #62, PR #63) — docs-delisted + provider 403/5018, SDXL-base
replacement, inpainting sibling untouched.

## Step 1: Verify the deprecation (evidence before removal)

Collect all three signals; a docs-404 alone is not proof of API removal
(Cloudflare's docs pipeline hides deprecated models from listings):

1. **Official deprecation lists** — check the Workers AI changelog for
   planned-deprecation batches covering the model id.
2. **Per-model docs page** — fetch
   `https://developers.cloudflare.com/workers-ai/models/<slug>/`.
   A 200 with params means live; a 404/redirect means docs-removed.
3. **Runtime probe** — run the Worker with remote bindings and describe
   the model, then send one real request for each of its supported tasks
   (`/v1/images/generations` for text-to-image, `/v1/images/edits` for
   image-to-image). Record the outcome.

Done when: every signal is recorded and the removal decision cites the
probe result, not just the docs page.

## Step 2: Name the replacement first

Per the `deprecation-and-migration` rule, never remove without a working
alternative. Pick the live model with the closest payload contract
(same input format and parameter keys preferred, e.g. JSON + `image_b64`
migrates cheaper than JSON → multipart) and document one alternative.
Done when: the replacement and its contract delta are written down.

## Step 3: Remove from the registry (the single seam)

The JSON model config is the source of truth with a TypeScript mirror;
the model lister, MCP tools, `/v1/models`, and `/api/internal/models`
(which drives the dropdown and control mapping) all project from it.

1. Delete the model entry from the JSON config and its TypeScript mirror.
2. Delete its alias entry, if any.
3. No frontend code edit: the dropdown populates dynamically from the
   registry — verify the id is gone when running locally instead.

Done when: a repo-wide grep for the model id returns zero hits outside
history and worktrees.

## Step 4: Update docs

Remove the model's row from the generation-model table and the API
reference's image-model tables, and delete (or mark superseded) its
per-model doc file. Leave sibling models' docs untouched.
Done when: docs list only live models and name the replacement where
the removed model was recommended.

## Step 5: Verify like an addition, in reverse

Mirror the `add-cf-models` verification levels:

1. Type-check passes.
2. Locally: listings exclude the id, describing it fails clearly, and
   requests against it are rejected with a clear error.
3. The replacement passes the generation/edits smoke tests for the
   removed model's supported tasks.

Done when: all three levels are reported with results, and existing
E2E suites covering the sibling models still pass.
