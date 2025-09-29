# lucid-origin

**Model ID**: @cf/leonardo/lucid-origin

**Mode**: Text-to-Image 

**Origin**: Leonardo

**Model Info**: Lucid Origin from Leonardo.AI is their most adaptable and prompt-responsive model to date. Whether you're generating images with sharp graphic design, stunning full-HD renders, or highly specific creative direction, it adheres closely to your prompts, renders text with accuracy, and supports a wide array of visual styles and aesthetics – from stylized concept art to crisp product mockups.

**Partner**: Yes

**Unit Pricing**: $0.007 per 512 by 512 tile, $0.00013 per step

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
      "@cf/leonardo/lucid-origin",
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
curl https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai/run/@cf/leonardo/lucid-origin  \
  -X POST  \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"  \
  -d '{ "prompt": "cyberpunk cat" }'
```


## Parameters

`*`  indicates a required field

### Input

-   `prompt`  required  min 1
    
    A text description of the image you want to generate.
    
-   `guidance`  default 4.5  min 0  max 10
    
    Controls how closely the generated image should adhere to the prompt; higher values make the image more aligned with the prompt
    
-   `seed`  min 0
    
    Random seed for reproducibility of the image generation
    
-   `height`  default 1120  min 0  max 2500
    
    The height of the generated image in pixels
    
-   `width`  default 1120  min 0  max 2500
    
    The width of the generated image in pixels
    
-   `num_steps`  default 4  min 1  max 40
    
    The number of diffusion steps; higher values can improve quality but take longer
    

### Output

-   `image`
    
    The generated image in Base64 format.
    

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
            "default": 4.5,
            "minimum": 0,
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
            "maximum": 2500,
            "default": 1120,
            "description": "The height of the generated image in pixels"
        },
        "width": {
            "type": "integer",
            "minimum": 0,
            "maximum": 2500,
            "default": 1120,
            "description": "The width of the generated image in pixels"
        },
        "num_steps": {
            "type": "integer",
            "default": 4,
            "minimum": 1,
            "maximum": 40,
            "description": "The number of diffusion steps; higher values can improve quality but take longer"
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
