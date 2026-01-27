# MCP Tools Modification Plan

## Overview
Modify MCP tools to use `model_id` instead of aliases, and update output formats.


## Changes Required

### 1. `list_models` Tool
**Current:** Returns markdown table with model name, capabilities, task types
**New:** Returns JSON with key-value pairs: `model_id` → `taskTypes[]`

```json
{
  "@cf/black-forest-labs/flux-1-schnell": ["text-to-image"],
  "@cf/black-forest-labs/flux-2-klein-4b": ["text-to-image", "image-to-image"],
  ...
}
```

### 2. `describe_model` Tool
**Current:** Returns markdown formatted parameter help
**New:** Returns OpenAPI schema format with type, min, max, default
**New:** Append to tool description: "You must call 'list_models' first to obtain the exact model_id required to use this tool, UNLESS the user explicitly provides a model_id  in the format '@cf/black-forest-labs/flux-1-schnell'"

```json
{
  "model_id": "@cf/black-forest-labs/flux-1-schnell",
  "parameters": {
    "prompt": {
      "type": "string",
      "required": true,
      "description": "Text description of the image"
    },
    "steps": {
      "type": "integer",
      "default": 4,
      "min": 1,
      "max": 8
    },
    ...
  }
}
```

### 3. `generate_image` → `run_models` Tool
**Current:** Accepts `model` parameter with aliases allowed
**New:** Accepts `model_id` parameter (no aliases), add detailed description
**New:** Append to tool description: "You must call 'describe_models' first to obtain the params required to use this tool, UNLESS the user explicitly provides params in the openapi format'"

**New Description:**
```
You must provide the exact model_id from the list_models tool output.
Available model_ids and their supported task types:
- @cf/black-forest-labs/flux-1-schnell (text-to-image)
- @cf/black-forest-labs/flux-2-klein-4b (text-to-image, image-to-image)
- @cf/black-forest-labs/flux-2-dev (text-to-image, image-to-image)
...
```

### 4. Update Tool Definitions in MCPEndpoint
Update `getToolDefinitions()` to reflect new parameter names and descriptions.

## Files to Modify

1. `workers/src/endpoints/mcp-endpoint.ts`
   - `handleListModels()` - Change output format
   - `handleDescribeModel()` - Change to OpenAPI schema format
   - `getToolDefinitions()` - Update tool definitions

2. `workers/src/config/models.ts`
   - May need helper functions to extract OpenAPI schema

## Test Plan

1. Start MCP inspector in background
2. Test `tools/list` to see new tool definitions
3. Test `list_models` with curl
4. Test `describe_model` for multiple models
5. Test `run_models` with model_id
6. Verify all 10 models work

## Progress

- [x] Modify list_models output format
- [x] Modify describe_model to OpenAPI schema
- [x] Rename generate_image to run_models
- [x] Update tool definitions
- [x] Test with MCP inspector
- [x] Write curl requests to docs/MCP_REQUEST_TEST.md
