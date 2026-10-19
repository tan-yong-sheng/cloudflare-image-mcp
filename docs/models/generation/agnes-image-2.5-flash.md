# agnes-image-2.5-flash

**Model ID**: agnes-image-2.5-flash

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
    "model": "agnes-image-2.5-flash",
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
    "model": "agnes-image-2.5-flash",
    "prompt": "make it a watercolor painting",
    "image": "https://example.com/input.png",
    "size": "1312x736"
  }'
```

### MCP

```json
{
  "model_id": "agnes-image-2.5-flash",
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

  The generated image encoded as a Base64 string (`b64_json`). The request
  always asks for base64; if the provider returns an image URL instead, the
  service downloads it and returns the bytes, so the seam output is the same
  either way. Only an `https` URL on the provider's own host (the configured
  API host) is fetched, and redirects are not followed: a Worker resolves DNS
  itself, so a public-looking name such as `127.0.0.1.nip.io` cannot be told
  apart from a real one, and pinning the host is what keeps a compromised
  response from reaching an internal address. Any other URL is refused rather
  than fetched.

## Size Reference

| Tier | Square | 16:9      | 9:16      | 3:4       | 4:3       | 2:3       | 3:2       | 21:9      |
| ---- | ------ | --------- | --------- | --------- | --------- | --------- | --------- | --------- |
| 1K   | 1024²  | 1312x736  | 736x1312  | 864x1152  | 1152x864  | 832x1248  | 1248x832  | 1568x672  |
| 2K   | 2048²  | 2624x1472 | 1472x2624 | 1728x2304 | 2304x1728 | 1664x2496 | 2496x1664 | 3136x1344 |
| 3K   | 3072²  | 3936x2208 | 2208x3936 | 2592x3456 | 3456x2592 | 2496x3744 | 3744x2496 | 4704x2016 |
| 4K   | 4096²  | 5248x2944 | 2944x5248 | 3456x4608 | 4608x3456 | 3328x4992 | 4992x3328 | 6272x2688 |

Any requested `WxH` is clamped to `limits` (512–4096 per side) and then
normalized to the nearest tier and aspect ratio; the transport sends that
tier and ratio. The table is the provider's published matrix, so a cell
wider or taller than 4096 cannot be requested exactly through this
integration — the clamped size maps to a nearby tier and ratio, and the
picker/MCP `supported_sizes` offer the `supportedSizes` subset (agnes-ai.com/
en/docs/agnes-image-25-flash, "Size and Ratio").
