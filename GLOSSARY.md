# Glossary

Domain terms for this repo. Use these exact words when naming concepts in
issues, refactors, hypotheses, and test names.

## Caller key

A bearer token a client sends in `Authorization: Bearer` to reach `/v1/*` and
`/mcp*`. Stored in the `caller_keys` table as a keyed verifier, never as
plaintext, and listed on the API-keys page (`/admin/api-keys`) through
`/api/admin/caller-keys`.

The UI calls them **API keys**, which is what an operator knows them as. The
code, the table and the HTTP route keep the domain term, because "API key"
alone would not say _whose_ — the provider credentials on the workbench are
API tokens too, and the management key is a third kind of secret again.
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

## Provider credential

The upstream secret the Worker presents to an image provider — a Cloudflare
account token, or an Agnes key. Stored in D1 as a sealed envelope in
`credential_versions` and opened per request with `PROVIDER_DATA_KEY`; it never
reaches a client. Distinct from the caller key a client sends us, and from the
management key that gates `/api/admin/*`.

## Servable

A provider credential is servable when its envelope opens with the current data
key and its row is enabled, so the pool can hand it out. A model is servable when
the provider serving it has at least one servable credential.

_Avoid_: "configured". A provider row existing is not the same as a credential
being servable, and collapsing the two is what made "No AI provider credentials
configured" unreadable — the message named a transport while the real state was
"no credential can be opened".

## Parked

A credential row that exists but cannot be served: its envelope will not open, or
the operator disabled it. A parked row stays visible to the operator and is never
picked for a request.

## Default model

A surface-owned preselection when the caller has not yet chosen a model. After
ADR-004 / #158, `/v1/images/*` never falls back: omitting `model` is
`model_required`. The only remaining default is the playground preselect
(#162), which is client-owned and never consulted by the HTTP API.
