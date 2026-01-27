
1. why localhost:3000/mcp and https://cloudflare-image-workers.tys203831.workers.dev/mcp shows error not found? they should be streamable http endpoint

2. web UI need to setup auth (Bearer api  key + Oauth 2.1) for frontend and streamable http mcp - use better-auth skills at @.claude/skills/better-auth


3. @cf/black-forest-labs/flux-2-klein-4b and @cf/black-forest-labs/flux-2-dev not working, perhaps need to /v1/image/generations/endpoint as well (remove /v1/image/edits and /v1/image/variations endpoint for this model from this codebase if exists) ... Double check their params at @docs/models/ please

(i) /v1/image/generations
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

4. Missed image generation models : @cf/leonardo/lucid-origin , @cf/leonardo/phoenix-1.0 (to be used for /v1/image/generations endpoint) ... Double check their params at @docs/models/ please


(i) /v1/image/generations
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


5. Missed image generation model : @cf/runwayml/stable-diffusion-v1-5-img2img , @cf/runwayml/stable-diffusion-v1-5-inpainting (to be used for /v1/image/edits endpoint), sample as below:- ... and make sure that the frontend should have way to upload image and mask ... Double check their params at @docs/models/ please

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

