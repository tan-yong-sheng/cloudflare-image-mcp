# flux-1-schnell

**Model ID**: @cf/black-forest-labs/flux-1-schnell

**Mode**: Text-to-Image

**Origin**: Black Forest Labs

**Model Info**: FLUX.1 [schnell] is a 12 billion parameter rectified flow transformer capable of generating images from text descriptions.

**Unit Pricing**: $0.000053 per 512 by 512 tile, $0.00011 per step

## Usage

- Workers - Returning a data URI - TypeScript
```ts
export interface Env {
  AI: Ai;
}

export default {
  async fetch(request, env): Promise<Response> {
    const response = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", {
      prompt: "a cyberpunk lizard",
      seed: Math.floor(Math.random() * 10),
    });

    // response.image is base64 encoded, can be used as a data URI for <img src="">
    const dataURI = `data:image/jpeg;charset=utf-8;base64,${response.image}`;

    return Response.json({ dataURI });
  },
} satisfies ExportedHandler<Env>;
```

- Workers - Returning an image - TypeScript
```ts
export interface Env {
  AI: Ai;
}

export default {
  async fetch(request, env): Promise<Response> {
    const response = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", {
      prompt: "a cyberpunk lizard",
      seed: Math.floor(Math.random() * 10),
    });

    // Convert from base64 string
    const binaryString = atob(response.image);

    // Create byte representation
    const img = Uint8Array.from(binaryString, (m) => m.codePointAt(0));

    return new Response(img, {
      headers: {
        "Content-Type": "image/jpeg",
      },
    });
  },
} satisfies ExportedHandler<Env>;
```

- curl
```curl
https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai/run/@cf/black-forest-labs/flux-1-schnell  \
  -X POST  \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"  \
  -d '{ "prompt": "cyberpunk cat", "seed": "Random positive integer" }'
```

## Parameters

`*`  indicates a required field

### Input

-   `prompt`  required  min 1  max 2048
    
    A text description of the image you want to generate.
    
-   `steps`  default 4  max 8
    
    The number of diffusion steps; higher values can improve quality but take longer.
    

### Output

-   `image`
    
    The generated image in Base64 format.
    

## API Schemas

The following schemas are based on JSON Schema

-   Input:

```json
{
    "type": "object",
    "properties": {
        "prompt": {
            "type": "string",
            "minLength": 1,
            "maxLength": 2048,
            "description": "A text description of the image you want to generate."
        },
        "steps": {
            "type": "integer",
            "default": 4,
            "maximum": 8,
            "description": "The number of diffusion steps; higher values can improve quality but take longer."
        }
    },
    "required": [
        "prompt"
    ]
}
```


-   Output

```json
{
    "type": "object",
    "contentType": "application/json",
    "properties": {
        "image": {
            "type": "string",
            "description": "The generated image in Base64 format."
        }
    }
}
```