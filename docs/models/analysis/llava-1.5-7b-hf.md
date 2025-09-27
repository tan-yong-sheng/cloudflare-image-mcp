# llava-1.5-7b-hf

Image-to-Text  •  llava-hf

@cf/llava-hf/llava-1.5-7b-hf

LLaVA is an open-source chatbot trained by fine-tuning LLaMA/Vicuna on GPT-generated multimodal instruction-following data. It is an auto-regressive language model, based on the transformer architecture.

## Usage
- Workers - TypeScript

## Parameters
`*`  indicates a required field

### Input
-   `0`: Binary string representing the image contents.
-   `1`
	- `image`  required 
        -   `0`: An array of integers that represent the image data constrained to 8-bit unsigned integer values
            -   `items`: A value between 0 and 255.
        -   `1`: Binary string representing the image contents.
    -   `temperature`: Controls the randomness of the output; higher values produce more random results.
    -   `prompt`: The input text prompt for the model to generate a response.
    -   `raw`: If true, a chat template is not applied and you must adhere to the specific model's expected formatting.
    -   `top_p`: Controls the creativity of the AI's responses by adjusting how many possible words it considers. Lower values make outputs more predictable; higher values allow for more varied and creative responses.
    -   `top_k`: Limits the AI to choose from the top 'k' most probable words. Lower values make responses more focused; higher values introduce more variety and potential surprises.
    -   `seed`: Random seed for reproducibility of the generation.
    -   `repetition_penalty`: Penalty for repeated tokens; higher values discourage repetition.
    -   `frequency_penalty`: Decreases the likelihood of the model repeating the same lines verbatim.
    -   `presence_penalty`: Increases the likelihood of the model introducing new topics.
    -   `max_tokens`: default 512 - The maximum number of tokens to generate in the response.

### Output
-   `description`

## API Schemas
The following schemas are based on JSON Schema

-   Input
```json
{
    "oneOf": [
        {
            "type": "string",
            "format": "binary",
            "description": "Binary string representing the image contents."
        },
        {
            "type": "object",
            "properties": {
                "image": {
                    "oneOf": [
                        {
                            "type": "array",
                            "description": "An array of integers that represent the image data constrained to 8-bit unsigned integer values",
                            "items": {
                                "type": "number",
                                "description": "A value between 0 and 255"
                            }
                        },
                        {
                            "type": "string",
                            "format": "binary",
                            "description": "Binary string representing the image contents."
                        }
                    ]
                },
                "temperature": {
                    "type": "number",
                    "description": "Controls the randomness of the output; higher values produce more random results."
                },
                "prompt": {
                    "type": "string",
                    "description": "The input text prompt for the model to generate a response."
                },
                "raw": {
                    "type": "boolean",
                    "default": false,
                    "description": "If true, a chat template is not applied and you must adhere to the specific model's expected formatting."
                },
                "top_p": {
                    "type": "number",
                    "description": "Controls the creativity of the AI's responses by adjusting how many possible words it considers. Lower values make outputs more predictable; higher values allow for more varied and creative responses."
                },
                "top_k": {
                    "type": "number",
                    "description": "Limits the AI to choose from the top 'k' most probable words. Lower values make responses more focused; higher values introduce more variety and potential surprises."
                },
                "seed": {
                    "type": "number",
                    "description": "Random seed for reproducibility of the generation."
                },
                "repetition_penalty": {
                    "type": "number",
                    "description": "Penalty for repeated tokens; higher values discourage repetition."
                },
                "frequency_penalty": {
                    "type": "number",
                    "description": "Decreases the likelihood of the model repeating the same lines verbatim."
                },
                "presence_penalty": {
                    "type": "number",
                    "description": "Increases the likelihood of the model introducing new topics."
                },
                "max_tokens": {
                    "type": "integer",
                    "default": 512,
                    "description": "The maximum number of tokens to generate in the response."
                }
            },
            "required": [
                "image"
            ]
        }
    ]
}
```

-   Output
```json
{
    "type": "object",
    "contentType": "application/json",
    "properties": {
        "description": {
            "type": "string"
        }
    }
}
```