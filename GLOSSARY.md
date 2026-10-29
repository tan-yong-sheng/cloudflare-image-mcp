# Glossary

Domain terms for this repo. Use these exact words when naming concepts in
issues, refactors, hypotheses, and test names.

## Caller key

A bearer token a client sends in `Authorization: Bearer` to reach `/v1/*` and
`/mcp*`. Stored in the `caller_keys` table as a keyed verifier, never as
plaintext, and listed in the admin workbench under `/api/admin/caller-keys`.
Also called a _caller key_ in magpie, whose gateway UI this feature was
researched from. Not the management key — see below.

## Management key

The secret an operator presents in `X-Admin-Key` to gate `/api/admin/*`. It
is held in memory only (never `sessionStorage`, `localStorage`, or a cookie),
and it is not a bearer token: it never reaches `/v1/*` or `/mcp*`. Distinct
from both the caller key above and the provider credentials the workbench
manages.

## Model controls

The per-model visible form controls (sliders, fields, dropdown options) in
the web UI. Driven from each model's `parameters` + `limits` via
`GET /api/internal/models` — never hardcoded. A control is shown only when
the model declares the corresponding parameter.

## Payload contract

The rule that a generation request body carries only parameters the target
model declares. Anything else is silently dropped by `toCFPayload`, so the
UI must not send it. See `ParamParser.toCFPayload`.

## Control mapping

The derivation of model-control visibility, bounds, and defaults from a
model's `parameters` (which keys, `min`/`max`/`step`/`default`) and
`limits` (`maxSteps`, min/max width/height). Lives in the frontend's
`applyModelControls`; the registry is the single source.

## Payload builder

The single seam owning caller-controls to Cloudflare-payload mapping:
`ParamParser.buildPayload` returns the payload plus the list of
caller-supplied keys the model drops. Payloads stay byte-identical to
the legacy mapping; the dropped list is observability for UI and logs.
