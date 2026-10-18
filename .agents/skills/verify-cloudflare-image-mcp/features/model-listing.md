# Model listing and auth gate

Model listing lets a client discover which Cloudflare Workers AI image models
this deployment serves, behind the app-wide bearer gate. It is the cheapest
end-to-end probe of the whole auth + config stack and needs no credentials in
the provider store.

## Sub-features

- `models-list` returns every exposed model as OpenAI-style model objects.
- `models-gated` rejects unauthenticated callers with 401 before any config
  is read.
- `health-public` reports version and auth state without a key.

## How to get to it (user POV)

- Any OpenAI-compatible client pointed at `/v1/models` with
  `Authorization: Bearer <key>`.
- A browser or curl on `/health` with no key (readiness, version).

## Driving it with curl

Preconditions:

- Doctor prints all `ok` on your `VERIFY_PORT`.
- `B=http://127.0.0.1:$VERIFY_PORT`, key `local-dev-user-key`.

- **Readiness.** `curl -s $B/health`. JSON with `"status":"healthy"`,
  `"version"` equal to `workers/package.json`, and `"authEnabled":true`.
- **List models.** `curl -s -H "Authorization: Bearer local-dev-user-key" $B/v1/models`.
  `data[]` of model objects; includes `@cf/black-forest-labs/flux-1-schnell`
  and `@cf/black-forest-labs/flux-2-dev`. Count matches the exposed set in
  `workers/src/config/models.json` minus models hidden by exposure config.
- **Unauthenticated contract.** `curl -s -o /dev/null -w '%{http_code}\n' $B/v1/models`.
  `401`, and the body's error names the missing/invalid key — never a model
  list.
- **Proof.** Save the 200 body and the 401 status to
  `evidence/verify/<run-id>/models.txt`.

## Gotchas

- Do not assert an exact model count without checking the current
  `models.json`; the list changes with the model catalog.
- A 200 without the Authorization header means you are driving a foreign
  instance (or a build with auth disabled) — stop and re-run the doctor.
- `/v1/models` is bearer-gated but credential-store-independent: it works
  with an empty provider store by design.
