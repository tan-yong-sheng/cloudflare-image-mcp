#!/bin/bash
# Inpainting and Image-to-Image Tests - OpenAI-Compatible Format

BASE_URL="http://localhost:3000"
IMAGE_FILE="test_images/white-cloud-blue-sky-sea.jpg"
MASK_FILE="test_images/white-cloud-blue-sky-sea.jpg"  # Using same image as mask for testing

echo "=== INPAINTING TESTS (with mask) ==="
echo ""

# Test 1: SDXL Inpainting
echo "1. SDXL Inpainting (multipart)..."
curl -s -X POST "$BASE_URL/v1/images/edits" \
  -F "model=sdxl-base" \
  -F "prompt=Replace the background with a tropical beach" \
  -F "image=@$IMAGE_FILE;type=image/jpeg" \
  -F "mask=@$MASK_FILE;type=image/jpeg" \
  -F "n=1" \
  -F "size=512x512" \
  -F "strength=0.9"
echo ""
echo ""

# Test 2: SD 1.5 Inpainting
echo "2. SD 1.5 Inpainting (multipart)..."
curl -s -X POST "$BASE_URL/v1/images/edits" \
  -F "model=sd-1.5-inpainting" \
  -F "prompt=Replace with a dragon" \
  -F "image=@$IMAGE_FILE;type=image/jpeg" \
  -F "mask=@$MASK_FILE;type=image/jpeg" \
  -F "n=1" \
  -F "size=512x512" \
  -F "strength=0.9"
echo ""
echo ""

echo "=== IMAGE-TO-IMAGE TESTS (without mask) ==="
echo ""

# Test 3: SDXL Image-to-Image
echo "3. SDXL Image-to-Image (multipart, no mask)..."
curl -s -X POST "$BASE_URL/v1/images/edits" \
  -F "model=sdxl-base" \
  -F "prompt=Transform into a winter wonderland scene" \
  -F "image=@$IMAGE_FILE;type=image/jpeg" \
  -F "n=1" \
  -F "size=512x512" \
  -F "strength=0.7"
echo ""
echo ""

# Test 4: DreamShaper Image-to-Image
echo "4. DreamShaper Image-to-Image (multipart, no mask)..."
curl -s -X POST "$BASE_URL/v1/images/edits" \
  -F "model=dreamshaper" \
  -F "prompt=Make this look like an oil painting" \
  -F "image=@$IMAGE_FILE;type=image/jpeg" \
  -F "n=1" \
  -F "size=512x512" \
  -F "strength=0.5"
echo ""
echo ""

# Test 5: SD 1.5 Image-to-Image
echo "5. SD 1.5 Image-to-Image (multipart, no mask)..."
curl -s -X POST "$BASE_URL/v1/images/edits" \
  -F "model=sd-1.5-img2img" \
  -F "prompt=Transform into a cyberpunk character" \
  -F "image=@$IMAGE_FILE;type=image/jpeg" \
  -F "n=1" \
  -F "size=512x512" \
  -F "strength=0.6"
echo ""
echo ""

# Test 6: FLUX Klein Image-to-Image
echo "6. FLUX Klein Image-to-Image (multipart, no mask)..."
curl -s -X POST "$BASE_URL/v1/images/edits" \
  -F "model=flux-klein" \
  -F "prompt=Transform into a cyberpunk style with neon lights" \
  -F "image=@$IMAGE_FILE;type=image/jpeg" \
  -F "n=1" \
  -F "size=512x512"
echo ""
echo ""

# Test 7: FLUX Dev Image-to-Image
echo "7. FLUX Dev Image-to-Image (multipart, no mask)..."
curl -s -X POST "$BASE_URL/v1/images/edits" \
  -F "model=flux-dev" \
  -F "prompt=Turn this into a watercolor painting" \
  -F "image=@$IMAGE_FILE;type=image/jpeg" \
  -F "n=1" \
  -F "size=512x512"
echo ""
echo ""

echo "=== DOUBLE CHECK (Text-to-Image) ==="
echo ""

# Double Check 1: flux-schnell txt2img
echo "D1. flux-schnell txt2img..."
curl -s -X POST "$BASE_URL/v1/images/generations" \
  -H "Content-Type: application/json" \
  -d '{"model": "flux-schnell", "prompt": "a simple cat", "n": 1, "size": "512x512"}'
echo ""
echo ""

# Double Check 2: flux-klein txt2img
echo "D2. flux-klein txt2img..."
curl -s -X POST "$BASE_URL/v1/images/generations" \
  -H "Content-Type: application/json" \
  -d '{"model": "flux-klein", "prompt": "a futuristic robot", "n": 1, "size": "512x512"}'
echo ""
echo ""

echo "=== TESTS COMPLETE ==="
