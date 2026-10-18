# agnes-image-2.5-flash

**Model ID**: @agnes/agnes-image-2.5-flash

**Mode**: Text-to-Image • Image-to-Image

**Origin**: Agnes AI

**Model Info**: Agnes AI's flash-tier image model for text-to-image generation
and image composition (image-to-image), with 1K-4K output tiers and explicit
aspect-ratio control.

**Unit Pricing** (re-checked 2026-10-16): list price $0.010 per 1K image,
$0.018 per 2K, $0.021 per 3K, $0.024 per 4K, plus $0.003 per input reference
image from the fourth onward. The provider currently charges $0 for this model.

Sources:

- https://agnes-ai.com/en/docs/agnes-image-25-flash
- https://wiki.agnes-ai.com/en/docs/pricing

## Transport

This model is **not** served by Cloudflare Workers AI. Its
`inferenceProvider` is `openai-compat` — the registry key that ADR-002 binds
to `workers/src/services/openai-transport.ts` — and the provider row seeded
by migration `0005` supplies the credentials. Publish an Agnes API key for
the `agnes` provider through the admin UI (`/#admin`); the transport calls
`https://apihub.agnes-ai.com/v1/images/generations` with it. There is no
environment-variable fallback for this provider (ADR-001).

## Usage

### OpenAI-compatible API

```bash
curl -sS -X POST "http://localhost:8787/v1/images/generations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-api-key>" \
  -d '{
    "model": "@agnes/agnes-image-2.5-flash",
    "prompt": "a lighthouse at dusk, long exposure",
    "size": "2048x2048",
    "n": 1
  }'
```

Image-to-image (pass a public URL or a data-URI base64):

```bash
curl -sS -X POST "http://localhost:8787/v1/images/edits" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-api-key>" \
  -d '{
    "model": "@agnes/agnes-image-2.5-flash",
    "prompt": "make it a watercolor painting",
    "image": "https://example.com/input.png",
    "size": "1312x736"
  }'
```

### MCP

```json
{
  "model_id": "@agnes/agnes-image-2.5-flash",
  "prompt": "a lighthouse at dusk, long exposure",
  "size": "2048x2048"
}
```

## Parameters

`*` indicates a required field

### Input

- `prompt` **required** max 2048

  A text description of the image you want to generate.

- `size` default `1024x1024`

  Requested output size as `WxH`. The service maps it to the nearest
  published tier (1K/2K/3K/4K, chosen by area) and aspect ratio (chosen by
  log-distance), then sends the tier and ratio upstream.

### Output

- `image`

  The generated image encoded as a Base64 string (`b64_json`). If the
  provider returns a public URL instead, the service downloads it and returns
  the bytes, so the seam output is the same either way.

## Size Reference

| Tier | Square | 16:9     | 9:16     | 3:4      | 4:3      | 2:3      | 3:2      | 21:9     |
| ---- | ------ | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| 1K   | 1024²  | 1312x736 | 736x1312 | 864x1152 | 1152x864 | 832x1248 | 1248x832 | 1568x672 |
| 2K   | 2048²  | —        | —        | —        | —        | —        | —        | —        |
| 3K   | 3072²  | —        | —        | —        | —        | —        | —        | —        |
| 4K   | 4096²  | —        | —        | —        | —        | —        | —        | —        |

Any requested `WxH` is accepted and normalized; the table lists the published
tier/ratio dimensions the mapping targets. A `—` cell is a tier whose
non-square dimensions the provider docs do not publish: the request still
sends that tier with the mapped ratio, and the exact pixels are the
provider's to choose.
