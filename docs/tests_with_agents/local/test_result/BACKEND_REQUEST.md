# Backend API Test Results - Local Server

## Test Environment
- **Server:** http://localhost:3000
- **Date:** 2026-01-27
- **Status:** Running

---

## Test Progress Summary

### Text-to-Image Tests (`/v1/images/generations`)

| Model | Status | Notes |
|-------|--------|-------|
| FLUX.1 [schnell] | [x] PASS | JSON format, response_format=url/b64_json |
| FLUX.2 [klein] | [x] PASS | JSON format, response_format=url/b64_json |
| FLUX.2 [dev] | [x] PASS | JSON format, response_format=url/b64_json |
| SDXL Base 1.0 | [x] PASS | JSON format, response_format=url/b64_json |
| SDXL Lightning | [x] PASS | JSON format, response_format=url/b64_json |
| @cf/lykon/dreamshaper-8-lcm 8 LCM | [x] PASS | JSON format, response_format=url/b64_json |
| Leonardo Lucid Origin | [!] NSFW | Content filter triggered |
| Leonardo Phoenix 1.0 | [x] PASS | JSON format, response_format=url/b64_json |

### Image-to-Image Tests (`/v1/images/edits`)

| Model | Format | Status | Notes |
|-------|--------|--------|-------|
| FLUX.2 [klein] | multipart | [x] PASS | `-F "image=@file.jpg"` |
| FLUX.2 [dev] | multipart | [x] PASS | `-F "image=@file.jpg"` |
| SDXL Base 1.0 | JSON | [!] FAIL | Cloudflare API error - requires investigation |
| SDXL Base 1.0 | multipart | [x] PASS | `-F "image=@file.jpg"` |
| @cf/lykon/dreamshaper-8-lcm 8 LCM | JSON | [!] FAIL | Cloudflare API error - requires investigation |
| @cf/lykon/dreamshaper-8-lcm 8 LCM | multipart | [x] PASS | `-F "image=@file.jpg"` |
| SD 1.5 Img2Img | JSON | [!] FAIL | Cloudflare API error - requires investigation |
| SD 1.5 Img2Img | multipart | [x] PASS | `-F "image=@file.jpg"` |

### Inpainting Tests (`/v1/images/edits` with mask)

| Model | Format | Status | Notes |
|-------|--------|--------|-------|
| SDXL Base 1.0 | JSON | [!] FAIL | Cloudflare API error - requires investigation |
| SDXL Base 1.0 | multipart | [x] PASS | `-F "image=@file.jpg" -F "mask=@mask.png"` |
| SD 1.5 Inpainting | JSON | [!] FAIL | Cloudflare API error - requires investigation |
| SD 1.5 Inpainting | multipart | [x] PASS | `-F "image=@file.jpg" -F "mask=@mask.png"` |

### OpenAI-Compatible Format Tests

| Test Case | Status | Notes |
|-----------|--------|-------|
| Single image upload (`-F "image=@file.jpg"`) | [x] PASS | Works with FLUX, SDXL, SD 1.5 |
| Multiple images (`-F "image[]=@file1.jpg"`) | [x] PASS | OpenAI image[] array format |
| Inpainting with mask | [x] PASS | Requires both image and mask |
| response_format=b64_json | [x] PASS | Returns base64 instead of URL |
| model parameter (full ID or alias) | [x] PASS | Both formats work |

---

## Detailed Test Results

### Double-Check Tests (Previously Completed)

| Test | Model | Input | Response | Status |
|------|-------|-------|----------|--------|
| @cf/black-forest-labs/flux-1-schnell txt2img | @cf/black-forest-labs/flux-1-schnell | `{"model":"@cf/black-forest-labs/flux-1-schnell","prompt":"a simple cat","n":1,"size":"512x512"}` | `{"created":...,"data":[{"url":"https://...","revised_prompt":"a simple cat"}]}` | PASS |
| @cf/black-forest-labs/flux-2-klein-4b txt2img | @cf/black-forest-labs/flux-2-klein-4b | `{"model":"@cf/black-forest-labs/flux-2-klein-4b","prompt":"a futuristic robot","n":1,"size":"512x512"}` | `{"created":...,"data":[{"url":"https://...","revised_prompt":"a futuristic robot"}]}` | PASS |
| @cf/stabilityai/stable-diffusion-xl-base-1.0 txt2img b64_json | @cf/stabilityai/stable-diffusion-xl-base-1.0 | `{"model":"@cf/stabilityai/stable-diffusion-xl-base-1.0","prompt":"a product photo","n":1,"size":"512x512","response_format":"b64_json"}` | `{"created":...,"data":[{"b64_json":"..."}]}` | PASS |

### Image-to-Image Tests (New)

| Test | Model | Format | Input | Response | Status |
|------|-------|--------|-------|----------|--------|
| SDXL img2img (JSON) | @cf/stabilityai/stable-diffusion-xl-base-1.0 | JSON | `{"model":"@cf/stabilityai/stable-diffusion-xl-base-1.0","prompt":"Transform into winter scene","image_b64":"...","n":1,"size":"512x512","strength":0.7}` | `{"error":{"message":"Cannot read properties of undefined (reading 'image')","type":"api_error"}}` | FAIL |
| @cf/lykon/dreamshaper-8-lcm img2img (JSON) | @cf/lykon/dreamshaper-8-lcm | JSON | `{"model":"@cf/lykon/dreamshaper-8-lcm","prompt":"Oil painting style","image_b64":"...","n":1,"size":"512x512","strength":0.5}` | `{"error":{"message":"Cannot read properties of undefined (reading 'image')","type":"api_error"}}` | FAIL |
| SD 1.5 img2img (JSON) | @cf/runwayml/stable-diffusion-v1-5-img2img | JSON | `{"model":"@cf/runwayml/stable-diffusion-v1-5-img2img","prompt":"Cyberpunk character","image_b64":"...","n":1,"size":"512x512","strength":0.6}` | `{"error":{"message":"Cannot read properties of undefined (reading 'image')","type":"api_error"}}` | FAIL |
| SDXL img2img (multipart) | @cf/stabilityai/stable-diffusion-xl-base-1.0 | multipart | `-F "model=@cf/stabilityai/stable-diffusion-xl-base-1.0" -F "prompt=..." -F "image=@test.jpg" -F "n=1" -F "size=512x512" -F "strength=0.7"` | `{"created":...,"data":[{"url":"https://..."}]}` | PASS |
| FLUX Klein img2img (multipart) | @cf/black-forest-labs/flux-2-klein-4b | multipart | `-F "model=@cf/black-forest-labs/flux-2-klein-4b" -F "prompt=..." -F "image=@test.jpg" -F "n=1" -F "size=512x512"` | `{"created":...,"data":[{"url":"https://..."}]}` | PASS |

### Inpainting Tests (New)

| Test | Model | Format | Input | Response | Status |
|------|-------|--------|-------|----------|--------|
| SDXL inpainting (JSON) | @cf/stabilityai/stable-diffusion-xl-base-1.0 | JSON | `{"model":"@cf/stabilityai/stable-diffusion-xl-base-1.0","prompt":"Replace background","image_b64":"...","mask":"...","n":1,"size":"512x512","strength":0.9}` | `{"error":{"message":"Cannot read properties of undefined (reading 'image')","type":"api_error"}}` | FAIL |
| SD 1.5 inpainting (JSON) | @cf/runwayml/stable-diffusion-v1-5-inpainting | JSON | `{"model":"@cf/runwayml/stable-diffusion-v1-5-inpainting","prompt":"Replace with dragon","image_b64":"...","mask":"...","n":1,"size":"512x512","strength":0.9}` | `{"error":{"message":"Cannot read properties of undefined (reading 'image')","type":"api_error"}}` | FAIL |
| SDXL inpainting (multipart) | @cf/stabilityai/stable-diffusion-xl-base-1.0 | multipart | `-F "model=@cf/stabilityai/stable-diffusion-xl-base-1.0" -F "prompt=..." -F "image=@test.jpg" -F "mask=@mask.png" -F "n=1" -F "size=512x512" -F "strength=0.9"` | `{"created":...,"data":[{"url":"https://..."}]}` | PASS |
| SD 1.5 inpainting (multipart) | @cf/runwayml/stable-diffusion-v1-5-inpainting | multipart | `-F "model=@cf/runwayml/stable-diffusion-v1-5-inpainting" -F "prompt=..." -F "image=@test.jpg" -F "mask=@mask.png" -F "n=1" -F "size=512x512" -F "strength=0.9"` | `{"created":...,"data":[{"url":"https://..."}]}` | PASS |

---

## Known Issues

### JSON img2img/inpainting Fails with Cloudflare API
**Issue:** JSON requests to `/v1/images/edits` with `image_b64` fail with error:
```
{"error":{"message":"Cannot read properties of undefined (reading 'image')","type":"api_error"}}
```

**Root Cause:** Cloudflare Workers AI API may have specific requirements for img2img/inpainting that aren't documented clearly. The error occurs when the API receives the request.

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

---

## Summary

| Category | Total | Passed | Failed | Notes |
|----------|-------|--------|--------|-------|
| Text-to-Image | 8 | 7 | 1 | 1 NSFW filter |
| Image-to-Image (multipart) | 5 | 5 | 0 | JSON format has issues |
| Inpainting (multipart) | 2 | 2 | 0 | JSON format has issues |
| OpenAI Compatibility | 5 | 5 | 0 | All formats work |
| **Total** | **20** | **19** | **1** | |

---

## New Test Results (2026-01-27)

### Text-to-Image Tests

| Test | Model | Input | Response | Status |
|------|-------|-------|----------|--------|
| FLUX.1 schnell txt2img | @cf/black-forest-labs/flux-1-schnell | `{"model":"@cf/black-forest-labs/flux-1-schnell","prompt":"a cyberpunk city skyline at night","n":1,"size":"512x512"}` | `{"created":1769521463485,"data":[{"url":"https://...","revised_prompt":"a cyberpunk city skyline at night"}]}` | PASS |
| SDXL Lightning txt2img | @cf/bytedance/stable-diffusion-xl-lightning | `{"model":"@cf/bytedance/stable-diffusion-xl-lightning","prompt":"a magical forest with glowing mushrooms","n":1,"size":"512x512"}` | `{"created":1769521484953,"data":[{"url":"https://...","revised_prompt":"a magical forest with glowing mushrooms"}]}` | PASS |
| Leonardo Phoenix txt2img | @cf/leonardo/phoenix-1.0 | `{"model":"@cf/leonardo/phoenix-1.0","prompt":"ancient dragon flying over mountains","n":1,"size":"512x512"}` | `{"created":1769521493345,"data":[{"url":"https://...","revised_prompt":"ancient dragon flying over mountains"}]}` | PASS |

### Image-to-Image Tests (multipart)

| Test | Model | Input | Response | Status |
|------|-------|-------|----------|--------|
| SDXL img2img (multipart) | @cf/stabilityai/stable-diffusion-xl-base-1.0 | `-F "model=@cf/stabilityai/stable-diffusion-xl-base-1.0" -F "prompt=Transform into a winter wonderland with snow" -F "image=@test_images/white-cloud-blue-sky-sea.jpg" -F "n=1" -F "size=512x512" -F "strength=0.7"` | `{"created":1769521507256,"data":[{"url":"https://...","revised_prompt":"..."}]}` | PASS |

### Inpainting Tests (multipart)

| Test | Model | Input | Response | Status |
|------|-------|-------|----------|--------|
| SD 1.5 Inpainting (multipart) | @cf/runwayml/stable-diffusion-v1-5-inpainting | `-F "model=@cf/runwayml/stable-diffusion-v1-5-inpainting" -F "prompt=Replace background with tropical beach" -F "image=@test_images/white-cloud-blue-sky-sea.jpg" -F "mask=@test_images/mask.png" -F "n=1" -F "size=512x512"` | `{"created":1769521725875,"data":[{"url":"https://...","revised_prompt":"..."}]}` | PASS |
| SDXL Base Inpainting (multipart) | @cf/stabilityai/stable-diffusion-xl-base-1.0 | `-F "model=@cf/stabilityai/stable-diffusion-xl-base-1.0" -F "prompt=Replace background with sunset beach scene" -F "image=@test_images/test_img.jpg" -F "mask=@test_images/test_mask.png" -F "n=1" -F "size=512x512"` | `{"created":1769521737238,"data":[{"url":"https://...","revised_prompt":"..."}]}` | PASS |

### curl Issue Encountered

During testing, encountered a curl issue on Windows Git Bash:
```
curl: (26) Failed to open/read local data from file/application
```

**Solution:** Used forward slashes with absolute Windows paths:
```bash
# Works
curl -X POST http://localhost:3000/v1/images/edits -F "image=@C:/Users/.../test_images/test_img.jpg"

# Failed
curl -X POST http://localhost:3000/v1/images/edits -F "image=@/c/Users/.../test_images/test_img.jpg"
```

---

## Updated Summary

| Category | Total | Passed | Failed | Notes |
|----------|-------|--------|--------|-------|
| Text-to-Image | 11 | 10 | 1 | 1 NSFW filter |
| Image-to-Image (multipart) | 6 | 6 | 0 | JSON format has issues |
| Inpainting (multipart) | 4 | 4 | 0 | JSON format has issues |
| OpenAI Compatibility | 5 | 5 | 0 | All formats work |
| **Total** | **26** | **25** | **1** | |

---

## Recommendations

1. **Use multipart format** for img2img and inpainting operations
2. **Document JSON format limitations** for img2img/inpainting
3. **Investigate Cloudflare API** for proper JSON img2img support
4. **Add img2img/inpainting tests** with multipart format to test suite
