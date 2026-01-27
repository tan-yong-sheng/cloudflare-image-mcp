1. why localhost:3000/mcp and https://cloudflare-image-workers.tys203831.workers.dev/mcp shows error not found? they should be streamable http endpoint

2. web UI need to setup auth (Bearer api  key + Oauth 2.1) for frontend and streamable http mcp - use better-auth skills at @.claude/skills/better-auth [no need implement first]


3. @cf/black-forest-labs/flux-2-klein-4b and @cf/black-forest-labs/flux-2-dev not working, perhaps need to /v1/images/generations/endpoint as well (remove /v1/images/edits and /v1/image/variations endpoint for this model from this codebase if exists) ... Double check their params at @docs/models/ please

(i) /v1/images/generations
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

4. Missed image generation models : @cf/leonardo/lucid-origin , @cf/leonardo/phoenix-1.0 (to be used for /v1/images/generations endpoint) ... Double check their params at @docs/models/ please


(i) /v1/images/generations
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


5. Missed image generation model : @cf/runwayml/stable-diffusion-v1-5-img2img , @cf/runwayml/stable-diffusion-v1-5-inpainting (to be used for /v1/images/edits endpoint), sample as below:- ... and make sure that the frontend should have way to upload image and mask ... Double check their params at @docs/models/ please

```bash
curl https://api.openai.com/v1/images/edits \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -F image=@path/to/image.png \
  -F mask=@path/to/mask.png \
  -F prompt="A sunlit indoor lounge with a cozy sofa" \
  -F n=1 \
  -F size="1024x1024"
```



6. On Web UI, the time duration display for recording the duration of running models don't works


7. SDXL Base 1.0 Inpainting/Image-to-Image Issues

**Issue:** JSON format requests to `/v1/images/edits` with `image_b64` parameter fail for SDXL Base 1.0 img2img and inpainting operations.

**Error:**
```
{"error":{"message":"Cannot read properties of undefined (reading 'image')","type":"api_error"}}
```

**Workaround:** Use multipart form data format instead:
```bash
curl -X POST http://localhost:3000/v1/images/edits \
  -F "model=@cf/stabilityai/stable-diffusion-xl-base-1.0" \
  -F "prompt=Transform into a winter scene" \
  -F "image=@test_image.jpg;type=image/jpeg" \
  -F "n=1" \
  -F "size=512x512" \
  -F "strength=0.7"
```

**Test Results:** See [Test Results Document](../tests_with_agents/local/test_result/BACKEND_REQUEST.md)
- Image-to-Image (multipart): PASS
- Inpainting (multipart): PASS
- Image-to-Image (JSON): FAIL
- Inpainting (JSON): FAIL

**Next Steps:**
- Investigate Cloudflare Workers AI API requirements for JSON img2img/inpainting
- Consider adding support for multipart format as primary for these operations
- Document JSON format limitations in API documentation

