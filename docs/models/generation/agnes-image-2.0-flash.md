# agnes-image-2.0-flash

**Model ID**: agnes-image-2.0-flash

**Mode**: Text-to-Image • Image-to-Image

**Origin**: Agnes AI

**Model Info**: Agnes AI's first flash-tier image generation and editing model,
for text-to-image, image-to-image, and multi-image composition. It differs from
2.1 and 2.5 in one API-visible way: `size` is an **exact** `WxH` canvas and
there is **no `ratio` parameter**.

**Unit Pricing**: list price $0.010 per 1K image, $0.018 per 2K, $0.021 per
3K, $0.024 per 4K; the first three input reference images carry no extra
charge. The provider currently charges $0 for this model.

Sources:

- https://agnes-ai.com/en/docs/agnes-image-20-flash
- https://wiki.agnes-ai.com/en/docs/pricing

## Transport

This model is **not** served by Cloudflare Workers AI. Its
`inferenceProvider` is `openai-compat` — the registry key that ADR-002 binds
to `workers/src/services/openai-transport.ts` — and the provider row seeded
by migration `0005` supplies the credentials. Publish an Agnes API key for
the `agnes` provider through the admin UI (`/#admin`); the transport calls
`https://apihub.agnes-ai.com/v1/images/generations` with it. There is no
environment-variable fallback for this provider (ADR-001).

Because 2.0 takes an exact canvas, it declares `sizeStrategy: "exact"`: the
transport sends the requested `WxH` verbatim and withholds `ratio`, instead of
sending a resolution tier the way 2.1 and 2.5 require.

## Usage

### OpenAI-compatible API

```bash
curl -sS -X POST "http://localhost:8787/v1/images/generations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-api-key>" \
  -d '{
    "model": "agnes-image-2.0-flash",
    "prompt": "a cozy reading nook, morning light, film grain",
    "size": "1024x768",
    "n": 1
  }'
```

Image-to-image (pass public URLs or data-URI base64):

```bash
curl -sS -X POST "http://localhost:8787/v1/images/edits" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-api-key>" \
  -d '{
    "model": "agnes-image-2.0-flash",
    "prompt": "turn this into a pencil sketch",
    "image": "https://example.com/input.png",
    "size": "1024x1024"
  }'
```

### MCP

```json
{
  "model_id": "agnes-image-2.0-flash",
  "prompt": "a cozy reading nook, morning light, film grain",
  "size": "1024x768"
}
```

## Parameters

`*` indicates a required field

### Input

- `prompt` **required** max 2048

  A text prompt describing the target image, or an editing instruction.

- `size` default `1024x1024`

  Exact output size as `WxH`, sent upstream unchanged. No aspect-ratio
  parameter exists for this model.

### Output

- `image`

  The generated image encoded as a Base64 string (`b64_json`). The request
  always asks for base64; if the provider returns an image URL instead, the
  service downloads it and returns the bytes, so the seam output is the same
  either way. Only an `https` URL on the provider's own host (the configured
  API host) is fetched, and redirects are not followed. Any other URL is
  refused rather than fetched.

## Size Reference

The provider publishes no size matrix for 2.0 and no width/height bounds. The
docs give the field as "such as" these values:

| Published size | Notes         |
| -------------- | ------------- |
| `1024x1024`    | square        |
| `1024x768`     | landscape 4:3 |
| `768x1024`     | portrait 3:4  |

`limits.supportedSizes` in `workers/src/config/models.json` lists exactly
these three, and `limits.minWidth`/`maxWidth`/`minHeight`/`maxHeight` mirror
2.5's 512–4096 because 2.0 publishes none of its own. Both are declarations
for the size picker and MCP `supported_sizes` — they are not upstream
validation. Widening them requires the provider's own limits, which these
docs do not state.
