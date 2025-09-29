# phoenix-1.0

**Model ID**: @cf/leonardo/phoenix-1.0

**Mode**: Text-to-Image

**Origin**: Leonardo

**Model Info**: Phoenix 1.0 is a model by Leonardo.Ai that generates images with exceptional prompt adherence and coherent text.

**Partner**: Yes

**Unit Pricing**: $0.0058 per 512 by 512 tile, $0.00011 per step

## Usage

- Workers - TypeScript
```ts
export interface Env {
  AI: Ai;
}

export default {
  async fetch(request, env): Promise<Response> {

    const inputs = {
      prompt: "cyberpunk cat",
    };

    const response = await env.AI.run(
      "@cf/leonardo/phoenix-1.0",
      inputs
    );

    return new Response(response, {
      headers: {
        "content-type": "image/jpg",
      },
    });
  },
} satisfies ExportedHandler<Env>;
```

- curl
```curl
curl https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai/run/@cf/leonardo/phoenix-1.0  \
  -X POST  \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"  \
  -d '{ "prompt": "cyberpunk cat" }'
```


## Parameters

`*`  indicates a required field

### Input

-   `prompt`  required  min 1
    
    A text description of the image you want to generate.
    
-   `guidance`  default 2  min 2  max 10
    
    Controls how closely the generated image should adhere to the prompt; higher values make the image more aligned with the prompt
    
-   `seed`  min 0
    
    Random seed for reproducibility of the image generation
    
-   `height`  default 1024  min 0  max 2048
    
    The height of the generated image in pixels
    
-   `width`  default 1024  min 0  max 2048
    
    The width of the generated image in pixels
    
-   `num_steps`  default 25  min 1  max 50
    
    The number of diffusion steps; higher values can improve quality but take longer
    
-   `negative_prompt`  min 1
    
    Specify what to exclude from the generated images
    

### Output

The binding returns a  `ReadableStream`  with the image in JPEG or PNG format (check the model's output schema).

## API Schemas

The following schemas are based on JSON Schema

-   Input
```
{
    "type": "object",
    "properties": {
        "prompt": {
            "type": "string",
            "minLength": 1,
            "description": "A text description of the image you want to generate."
        },
        "guidance": {
            "type": "number",
            "default": 2,
            "minimum": 2,
            "maximum": 10,
            "description": "Controls how closely the generated image should adhere to the prompt; higher values make the image more aligned with the prompt"
        },
        "seed": {
            "type": "integer",
            "minimum": 0,
            "description": "Random seed for reproducibility of the image generation"
        },
        "height": {
            "type": "integer",
            "minimum": 0,
            "maximum": 2048,
            "default": 1024,
            "description": "The height of the generated image in pixels"
        },
        "width": {
            "type": "integer",
            "minimum": 0,
            "maximum": 2048,
            "default": 1024,
            "description": "The width of the generated image in pixels"
        },
        "num_steps": {
            "type": "integer",
            "default": 25,
            "minimum": 1,
            "maximum": 50,
            "description": "The number of diffusion steps; higher values can improve quality but take longer"
        },
        "negative_prompt": {
            "type": "string",
            "minLength": 1,
            "description": "Specify what to exclude from the generated images"
        }
    },
    "required": [
        "prompt"
    ]
}
```

-   Output
```
{
    "type": "string",
    "contentType": "image/jpeg",
    "format": "binary",
    "description": "The generated image in JPEG format"
}
```