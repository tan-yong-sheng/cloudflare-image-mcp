#   stable-diffusion-xl-lightning

Text-to-Image  •  bytedance

@cf/bytedance/stable-diffusion-xl-lightning

SDXL-Lightning is a lightning-fast text-to-image generation model. It can generate high-quality 1024px images in a few steps.

Model Info

More information

[link ↗](https://huggingface.co/ByteDance/SDXL-Lightning)

Beta

Yes

Unit Pricing

$0.00 per step

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
      "@cf/bytedance/stable-diffusion-xl-lightning",
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
curl https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai/run/@cf/bytedance/stable-diffusion-xl-lightning  \
  -X POST  \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"  \
  -d '{ "prompt": "cyberpunk cat" }'
```


## Parameters

`*`  indicates a required field

### Input

-   `prompt`  required  min 1
    
    A text description of the image you want to generate
    
-   `negative_prompt`
    
    Text describing elements to avoid in the generated image
    
-   `height`  min 256  max 2048
    
    The height of the generated image in pixels
    
-   `width`  min 256  max 2048
    
    The width of the generated image in pixels
    
-   `image`
    
    For use with img2img tasks. An array of integers that represent the image data constrained to 8-bit unsigned integer values
    
    -   `items`
        
        A value between 0 and 255
        
-   `image_b64`
    
    For use with img2img tasks. A base64-encoded string of the input image
    
-   `mask`
    
    An array representing An array of integers that represent mask image data for inpainting constrained to 8-bit unsigned integer values
    
    -   `items`
        
        A value between 0 and 255
        
-   `num_steps`  default 20  max 20
    
    The number of diffusion steps; higher values can improve quality but take longer
    
-   `strength`  default 1
    
    A value between 0 and 1 indicating how strongly to apply the transformation during img2img tasks; lower values make the output closer to the input image
    
-   `guidance`  default 7.5
    
    Controls how closely the generated image should adhere to the prompt; higher values make the image more aligned with the prompt
    
-   `seed`
    
    Random seed for reproducibility of the image generation
    

### Output

The binding returns a  `ReadableStream`  with the image in PNG format.

## API Schemas

The following schemas are based on JSON Schema

-   Input
```json
{
    "type": "object",
    "properties": {
        "prompt": {
            "type": "string",
            "minLength": 1,
            "description": "A text description of the image you want to generate"
        },
        "negative_prompt": {
            "type": "string",
            "description": "Text describing elements to avoid in the generated image"
        },
        "height": {
            "type": "integer",
            "minimum": 256,
            "maximum": 2048,
            "description": "The height of the generated image in pixels"
        },
        "width": {
            "type": "integer",
            "minimum": 256,
            "maximum": 2048,
            "description": "The width of the generated image in pixels"
        },
        "image": {
            "type": "array",
            "description": "For use with img2img tasks. An array of integers that represent the image data constrained to 8-bit unsigned integer values",
            "items": {
                "type": "number",
                "description": "A value between 0 and 255"
            }
        },
        "image_b64": {
            "type": "string",
            "description": "For use with img2img tasks. A base64-encoded string of the input image"
        },
        "mask": {
            "type": "array",
            "description": "An array representing An array of integers that represent mask image data for inpainting constrained to 8-bit unsigned integer values",
            "items": {
                "type": "number",
                "description": "A value between 0 and 255"
            }
        },
        "num_steps": {
            "type": "integer",
            "default": 20,
            "maximum": 20,
            "description": "The number of diffusion steps; higher values can improve quality but take longer"
        },
        "strength": {
            "type": "number",
            "default": 1,
            "description": "A value between 0 and 1 indicating how strongly to apply the transformation during img2img tasks; lower values make the output closer to the input image"
        },
        "guidance": {
            "type": "number",
            "default": 7.5,
            "description": "Controls how closely the generated image should adhere to the prompt; higher values make the image more aligned with the prompt"
        },
        "seed": {
            "type": "integer",
            "description": "Random seed for reproducibility of the image generation"
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
    "type": "string",
    "contentType": "image/png",
    "format": "binary",
    "description": "The generated image in PNG format"
}
```