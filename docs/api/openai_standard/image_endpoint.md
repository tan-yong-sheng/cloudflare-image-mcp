# Images API

**Source:** [https://platform.openai.com/docs/api-reference/images](https://platform.openai.com/docs/api-reference/images)

Generate or edit images using text prompts and/or input images.
Related guide: [Image Generation Guide](https://platform.openai.com/docs/guides/images)

---

## Create Image

**POST** `https://api.openai.com/v1/images/generations`

Creates an image from a prompt.

### Request Body

| Field                | Type          | Required | Default    | Description                                                                                                                       |
| -------------------- | ------------- | -------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `prompt`             | string        | ✅        | —          | Text description of the desired image(s). Max length: **32k chars** (GPT image models), **1k** (`dall-e-2`), **4k** (`dall-e-3`). |
| `background`         | string | null | ❌        | `auto`     | Background transparency (`transparent`, `opaque`, `auto`). GPT image models only.                                                 |
| `model`              | string        | ❌        | `dall-e-2` | One of `dall-e-2`, `dall-e-3`, `gpt-image-1`, `gpt-image-1-mini`, `gpt-image-1.5`.                                                |
| `moderation`         | string | null | ❌        | `auto`     | Content filtering level (`low`, `auto`). GPT image models only.                                                                   |
| `n`                  | integer       | ❌        | `1`        | Number of images (1–10). `dall-e-3` supports only `1`.                                                                            |
| `output_compression` | integer       | ❌        | `100`      | Compression % (0–100). GPT image models + `webp/jpeg`.                                                                            |
| `output_format`      | string        | ❌        | `png`      | `png`, `jpeg`, or `webp`. GPT image models only.                                                                                  |
| `partial_images`     | integer       | ❌        | `0`        | Number of partial images for streaming (0–3).                                                                                     |
| `quality`            | string        | ❌        | `auto`     | GPT models: `low`, `medium`, `high`. DALL·E 3: `standard`, `hd`.                                                                  |
| `response_format`    | string        | ❌        | `url`      | `url` or `b64_json`. Not for GPT image models.                                                                                    |
| `size`               | string        | ❌        | `auto`     | Model-dependent sizes (see below).                                                                                                |
| `stream`             | boolean       | ❌        | `false`    | Enable streaming. GPT image models only.                                                                                          |
| `style`              | string        | ❌        | `vivid`    | `vivid` or `natural`. DALL·E 3 only.                                                                                              |
| `user`               | string        | ❌        | —          | End-user identifier for abuse monitoring.                                                                                         |

### Example

```bash
curl https://api.openai.com/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -d '{
    "model": "gpt-image-1.5",
    "prompt": "A cute baby sea otter",
    "n": 1,
    "size": "1024x1024"
  }'
```

### Response

```json
{
  "created": 1713833628,
  "data": [
    { "b64_json": "..." }
  ],
  "usage": {
    "total_tokens": 100,
    "input_tokens": 50,
    "output_tokens": 50,
    "input_tokens_details": {
      "text_tokens": 10,
      "image_tokens": 40
    }
  }
}
```

---

## Create Image Edit

**POST** `https://api.openai.com/v1/images/edits`

Edits or extends existing images using a prompt.

### Request Body (Key Fields)

| Field                                                              | Type           | Required | Description                                                       |
| ------------------------------------------------------------------ | -------------- | -------- | ----------------------------------------------------------------- |
| `image`                                                            | string | array | ✅        | Input images (`png`, `webp`, `jpg` <50MB). Up to 16 (GPT models). |
| `prompt`                                                           | string         | ✅        | Description of desired output.                                    |
| `mask`                                                             | file           | ❌        | Transparent areas mark editable regions. PNG <4MB.                |
| `input_fidelity`                                                   | string         | ❌        | `high` / `low`. `gpt-image-1` only.                               |
| `model`                                                            | string         | ❌        | `dall-e-2` or GPT image models.                                   |
| `n`                                                                | integer        | ❌        | 1–10 images.                                                      |
| `size`, `quality`, `background`, `output_format`, `stream`, `user` | —              | ❌        | Same meanings as generation endpoint.                             |

### Example

```bash
curl -X POST "https://api.openai.com/v1/images/edits" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -F "model=gpt-image-1.5" \
  -F "image[]=@body-lotion.png" \
  -F "image[]=@bath-bomb.png" \
  -F "image[]=@incense-kit.png" \
  -F "image[]=@soap.png" \
  -F 'prompt=Create a lovely gift basket with these four items in it'
```

---

## Create Image Variation

**POST** `https://api.openai.com/v1/images/variations`

Creates variations of an image (**DALL·E 2 only**).

| Field             | Type    | Required | Description                        |
| ----------------- | ------- | -------- | ---------------------------------- |
| `image`           | file    | ✅        | Square PNG <4MB.                   |
| `n`               | integer | ❌        | 1–10 images.                       |
| `size`            | string  | ❌        | `256x256`, `512x512`, `1024x1024`. |
| `response_format` | string  | ❌        | `url` or `b64_json`.               |
| `user`            | string  | ❌        | End-user identifier.               |

---

## Image Generation Response Object

| Field           | Type    | Description                     |
| --------------- | ------- | ------------------------------- |
| `created`       | integer | Unix timestamp.                 |
| `data`          | array   | Generated images.               |
| `background`    | string  | `transparent` or `opaque`.      |
| `output_format` | string  | `png`, `webp`, or `jpeg`.       |
| `size`          | string  | Output dimensions.              |
| `quality`       | string  | `low`, `medium`, `high`.        |
| `usage`         | object  | Token usage (GPT image models). |

### Example

```json
{
  "created": 1713833628,
  "data": [{ "b64_json": "..." }],
  "background": "transparent",
  "output_format": "png",
  "size": "1024x1024",
  "quality": "high",
  "usage": {
    "total_tokens": 100,
    "input_tokens": 50,
    "output_tokens": 50
  }
}
```

---
