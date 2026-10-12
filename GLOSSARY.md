# Glossary

Domain terms for this repo. Use these exact words when naming concepts in
issues, refactors, hypotheses, and test names.

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
