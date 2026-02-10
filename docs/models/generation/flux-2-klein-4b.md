![Black Forest Labs logo](https://developers.cloudflare.com/_astro/blackforestlabs.Ccs-Y4-D.svg)

# flux-2-klein-4b

**Text-to-Image • Black Forest Labs**
`@cf/black-forest-labs/flux-2-klein-4b`

FLUX.2 [klein] is an ultra-fast, distilled image model. It unifies image generation and editing in a single model, delivering state-of-the-art quality enabling interactive workflows, real-time previews, and latency-critical applications.

---

### Model Info

**Terms and License:** [link ↗](https://bfl.ai/legal/terms-of-service)
**Partner:** Yes
**Unit Pricing:** $0.000059 per input 512x512 tile, $0.000287 per output 512x512 tile

---

## Usage

### Workers - TypeScript

```ts
export interface Env {
  AI: Ai;
}

export default {
  async fetch(request, env): Promise<Response> {
    const form = new FormData();
    form.append('prompt', 'a sunset with a dog');
    form.append('width', '1024');
    form.append('height', '1024');

    // FormData doesn't expose its serialized body or boundary. Passing it to a
    // Request (or Response) constructor serializes it and generates the Content-Type
    // header with the boundary, which is required for the server to parse the multipart fields.
    const formResponse = new Response(form);
    const formStream = formResponse.body;
    const formContentType = formResponse.headers.get('content-type')!;

    const resp = await env.AI.run("@cf/black-forest-labs/flux-2-klein-9b", {
      multipart: {
        body: formStream,
        contentType: formContentType
      }
    });

    return Response.json(resp);
  },
} satisfies ExportedHandler<Env>;
```

---

### curl Example

```bash
curl --request POST \
  --url 'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/ai/run/@cf/black-forest-labs/flux-2-klein-4b' \
  --header 'Authorization: Bearer {TOKEN}' \
  --header 'Content-Type: multipart/form-data' \
  --form 'prompt=a sunset at the alps' \
  --form steps=25 \
  --form width=1024 \
  --form height=1024
```

---

## Parameters

> `*` indicates a required field

### Input

* `multipart` **required**

  * `body`
  * `contentType`

### Output

* `image`
  Generated image as Base64 string.

---

## API Schemas

The following schemas are based on **JSON Schema**.

### Input Schema

[Link](https://developers.cloudflare.com/workers-ai/models/flux-2-klein-4b/#tab-panel-726)

```json
{
  "type": "object",
  "properties": {
    "multipart": {
      "type": "object",
      "properties": {
        "body": {
          "type": "object"
        },
        "contentType": {
          "type": "string"
        }
      }
    }
  },
  "required": [
    "multipart"
  ]
}
```

### Output Schema

[Link](https://developers.cloudflare.com/workers-ai/models/flux-2-klein-4b/#tab-panel-727)

```json
{
  "type": "object",
  "properties": {
    "image": {
      "type": "string",
      "description": "Generated image as Base64 string."
    }
  }
}
```
