# Image generation

Image generation is the product's core: OpenAI-compatible
`/v1/images/generations`, `/v1/images/edits`, and `/v1/images/variations`
turn a prompt (plus optional input image/mask) into a stored image served
from `/images/<date>/<id>.png`. On the verification instance the provider
store is empty by design, so the default journey proves the full request
path down to the ADR-001 empty-credential rejection; success-path inference
needs seeded provider credentials (see Gotchas).

## Sub-features

- `gen-request-path` parses the request, resolves the model, reaches the
  transport, and fails with the ADR-001 error when no credentials exist.
- `gen-validation` rejects malformed requests (missing prompt, unknown
  model) without touching credentials.
- `edits-mask-required` rejects a mask-required model call without a mask.
- `gen-seeded-success` (conditional) stores an image and returns a
  retrievable `/images/...` URL when provider credentials are seeded.

## How to get to it (user POV)

- An OpenAI client configured with base URL `/v1` and this deployment's key.
- The frontend at `/` (prompt form) — browser surface, not covered by this
  curl map.

## Driving it with curl

Preconditions:

- Doctor prints all `ok`; bearer key `local-dev-user-key`.
- For `gen-seeded-success` only: provider credentials seeded via the admin
  API (real Cloudflare account token; paid inference).

- **Validation contract.** `curl -s -o /dev/null -w '%{http_code}\n' -X POST -H "Authorization: Bearer local-dev-user-key" -H "Content-Type: application/json" -d '{"model":"@cf/black-forest-labs/flux-1-schnell"}' $B/v1/images/generations`.
  `400` (prompt missing). Repeat with a prompt but `"model":"@cf/nope/nope"`
  — an error naming the unknown model, no credential access attempted.
- **Mask-required contract.** `POST /v1/images/edits` with a mask-required
  model and no mask field returns an error naming the requirement (see
  `e2e/tests/api/openai/edits.spec.ts` for the exact expected shape).
- **Empty-credential contract (default).** `curl -s -X POST -H "Authorization: Bearer local-dev-user-key" -H "Content-Type: application/json" -d '{"model":"@cf/black-forest-labs/flux-1-schnell","prompt":"a red dot","n":1}' $B/v1/images/generations`.
  HTTP 500, body contains `No AI provider credentials configured for
transport "cloudflare-rest"`. This proves parsing, model resolution, and
  the transport handoff all ran.
- **Seeded success (conditional).** Same request after seeding credentials:
  HTTP 200, `data[0].url` like `$B/images/<date>/<id>.png`; then
  `curl -s -o /tmp/out.bin -w '%{http_code} %{size_download}\n' <that url>`
  returns `200` with real image bytes (`file /tmp/out.bin` shows the format).
  The stored object is the side effect — the URL alone is not proof.
- **Proof.** Save status + body of each probe to
  `evidence/verify/<run-id>/generation.txt`; for seeded success also keep the
  fetched image bytes' `file` output.

## Gotchas

- The default 500 empty-credential error is the **expected** result on a
  fresh local store; do not report it as a regression, and do not seed real
  credentials just to avoid it.
- Seeded success spends real Cloudflare inference quota; keep prompts tiny
  and skip it unless the task explicitly needs the success path.
- `/images/...` URLs are public (no bearer); expiry follows
  `IMAGE_EXPIRY_HOURS=24`.
- `n > 1` and size/steps constraints come from each model's config in
  `models.json`; a 400 naming a limit is contract behavior, not a bug.
