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
transport sends the requested `WxH` (after the service clamps it to the
model's bounds) and withholds `ratio`, instead of
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
    "size": "1152x864",
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
  "size": "1152x864"
}
```

## Parameters

`*` indicates a required field

### Input

- `prompt` **required** max 2048

  A text prompt describing the target image, or an editing instruction.

- `size` default `1024x1024`

  Exact output size as `WxH`, sent upstream after clamping to 512–4096.
  No aspect-ratio
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

The provider publishes no size matrix for 2.0 and no width/height bounds;
the docs only give example values. What 2.0 actually delivers was probed
live against the provider (2026-10-21, one request per size, dimensions
read from the returned PNG):

| Verified exact canvas | Notes          |
| --------------------- | -------------- |
| `1024x1024`           | square         |
| `864x1152`            | portrait 3:4   |
| `1152x864`            | landscape 4:3  |
| `1312x736`            | landscape 16:9 |
| `736x1312`            | portrait 9:16  |
| `832x1248`            | portrait 2:3   |
| `1248x832`            | landscape 3:2  |
| `2048x2048`           | square 2K      |
| `3072x3072`           | square 3K      |
| `4096x4096`           | square 4K      |

The probe also caught the model **replacing** canvases the vendor text
suggests it takes: `1024x768` returns `1152x864` and `768x1024` returns
`864x1152` (same ratio, different pixels), and `1568x672` (21:9) snaps to
`1312x736`. `limits.supportedSizes` therefore lists only the ten verified
canvases: the picker, MCP `supported_sizes`, and the examples in this page
name nothing the provider silently swaps. The
`limits.minWidth`/`maxWidth`/`minHeight`/`maxHeight` still mirror 2.5's
512–4096 because 2.0 publishes none of its own; they clamp before sending
and are not upstream validation.

A future 21:9 or other canvas can join this table only after a live probe
confirms the provider returns exactly what was requested.
