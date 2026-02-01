#!/bin/bash
# MCP Image Input Enhancement Test Script
# Tests img2img/inpainting with URL, base64, and file path inputs

set -e

BASE_URL="http://localhost:3000/mcp"
MCP_ENDPOINT="$BASE_URL"

echo "========================================"
echo "MCP Image Input Enhancement Test Script"
echo "========================================"
echo ""

# Function to send MCP request
mcp_request() {
    local method=$1
    local params=$2
    local id=${3:-1}

    curl -s -X POST "$MCP_ENDPOINT" \
        -H "Content-Type: application/json" \
        -d "{\"jsonrpc\":\"2.0\",\"id\":$id,\"method\":\"$method\",\"params\":$params}"
}

# Get a base64 image for testing (small PNG)
TEST_IMAGE_PATH="C:/Users/tys/Documents/Coding/cloudflare-image-mcp/test_images/white-cloud-blue-sky-sea.jpg"
if [ -f "$TEST_IMAGE_PATH" ]; then
    TEST_IMAGE_BASE64=$(base64 -w0 "$TEST_IMAGE_PATH" 2>/dev/null || cat "$TEST_IMAGE_PATH" | base64 -w0)
    TEST_IMAGE_DATA_URI="data:image/jpeg;base64,${TEST_IMAGE_BASE64}"
else
    echo "Warning: Test image not found at $TEST_IMAGE_PATH"
    TEST_IMAGE_DATA_URI=""
fi

# Get mask for inpainting tests
MASK_PATH="C:/Users/tys/Documents/Coding/cloudflare-image-mcp/test_images/mask.png"
if [ -f "$MASK_PATH" ]; then
    MASK_BASE64=$(base64 -w0 "$MASK_PATH" 2>/dev/null || cat "$MASK_PATH" | base64 -w0)
    MASK_DATA_URI="data:image/png;base64,${MASK_BASE64}"
else
    echo "Warning: Mask not found at $MASK_PATH"
    MASK_DATA_URI=""
fi

echo "Test Images:"
echo "  - Test image: $TEST_IMAGE_PATH"
echo "  - Mask: $MASK_PATH"
echo ""

# Test 1: Text-to-Image (baseline - should still work)
echo "========================================"
echo "1. Text-to-Image (Baseline Test)"
echo "========================================"
RESP=$(mcp_request "tools/call" "{\"name\":\"run_models\",\"arguments\":{\"model_id\":\"@cf/black-forest-labs/flux-1-schnell\",\"prompt\":\"a cozy coffee shop\",\"n\":1,\"size\":\"512x512\"}}" "1")
echo "Response: $(echo $RESP | head -c 300)"
IMG_URL=$(echo $RESP | grep -o 'https://[^"]*\.png' || echo "")
if [ -n "$IMG_URL" ]; then
    echo "Image URL: $IMG_URL"
    echo "Status: [/] PASS"
else
    echo "Status: [x] FAIL - No image URL"
fi
echo ""

# Test 2: List models to verify img2img/inpainting models are available
echo "========================================"
echo "2. List Models (Verify img2img models)"
echo "========================================"
LIST_RESP=$(mcp_request "tools/call" "{\"name\":\"list_models\",\"arguments\":{}}" "2")
echo "img2img models available:"
echo "$LIST_RESP" | grep -o '"@cf[^"]*"\s*:\s*\[[^]]*\]' | grep -E "(image-to-image|inpainting)" || echo "Checking..."
echo ""

# Test 3: Image-to-Image with URL (if we have a public URL)
echo "========================================"
echo "3. Image-to-Image with URL"
echo "========================================"
# Use the previously generated image URL
if [ -n "$IMG_URL" ]; then
    RESP=$(mcp_request "tools/call" "{\"name\":\"run_models\",\"arguments\":{\"model_id\":\"@cf/stabilityai/stable-diffusion-xl-base-1.0\",\"prompt\":\"Transform into a winter wonderland with snow\",\"image\":\"$IMG_URL\",\"strength\":0.7,\"n\":1,\"size\":\"512x512\"}}" "3")
    echo "Response: $(echo $RESP | head -c 500)"
    NEW_IMG_URL=$(echo $RESP | grep -o 'https://[^"]*\.png' || echo "")
    if [ -n "$NEW_IMG_URL" ]; then
        echo "Image URL: $NEW_IMG_URL"
        echo "Status: [/] PASS"
    else
        echo "Status: [x] FAIL - No image URL"
    fi
else
    echo "Status: [x] SKIP - No previous image URL"
fi
echo ""

# Test 4: Image-to-Image with Base64 Data URI
echo "========================================"
echo "4. Image-to-Image with Base64 Data URI"
echo "========================================"
if [ -n "$TEST_IMAGE_DATA_URI" ]; then
    # Truncate base64 for curl (too long)
    SHORT_BASE64=$(echo "$TEST_IMAGE_DATA_URI" | cut -c1-500)
    echo "Using truncated base64 for test..."
    RESP=$(mcp_request "tools/call" "{\"name\":\"run_models\",\"arguments\":{\"model_id\":\"@cf/stabilityai/stable-diffusion-xl-base-1.0\",\"prompt\":\"Oil painting style transformation\",\"image\":\"data:image/jpeg;base64,$(echo $TEST_IMAGE_BASE64 | cut -c1-50000)\",\"strength\":0.6,\"n\":1,\"size\":\"512x512\"}}" "4")
    echo "Response: $(echo $RESP | head -c 500)"
    IMG_URL4=$(echo $RESP | grep -o 'https://[^"]*\.png' || echo "")
    if [ -n "$IMG_URL4" ]; then
        echo "Image URL: $IMG_URL4"
        echo "Status: [/] PASS"
    else
        echo "Status: [x] FAIL - No image URL"
    fi
else
    echo "Status: [x] SKIP - No test image"
fi
echo ""

# Test 5: Image-to-Image with Local File Path
echo "========================================"
echo "5. Image-to-Image with Local File Path"
echo "========================================"
if [ -f "$TEST_IMAGE_PATH" ]; then
    RESP=$(mcp_request "tools/call" "{\"name\":\"run_models\",\"arguments\":{\"model_id\":\"@cf/stabilityai/stable-diffusion-xl-base-1.0\",\"prompt\":\"Cyberpunk city style\",\"image\":\"$TEST_IMAGE_PATH\",\"strength\":0.8,\"n\":1,\"size\":\"512x512\"}}" "5")
    echo "Response: $(echo $RESP | head -c 500)"
    IMG_URL5=$(echo $RESP | grep -o 'https://[^"]*\.png' || echo "")
    if [ -n "$IMG_URL5" ]; then
        echo "Image URL: $IMG_URL5"
        echo "Status: [/] PASS"
    else
        echo "Status: [x] FAIL - No image URL"
    fi
else
    echo "Status: [x] SKIP - File not found"
fi
echo ""

# Test 6: Inpainting with URL
echo "========================================"
echo "6. Inpainting with URL"
echo "========================================"
if [ -n "$IMG_URL" ] && [ -n "$MASK_DATA_URI" ]; then
    RESP=$(mcp_request "tools/call" "{\"name\":\"run_models\",\"arguments\":{\"model_id\":\"@cf/stabilityai/stable-diffusion-xl-base-1.0\",\"prompt\":\"Replace background with tropical beach\",\"image\":\"$IMG_URL\",\"mask\":\"data:image/png;base64,$MASK_BASE64\",\"strength\":0.9,\"n\":1,\"size\":\"512x512\"}}" "6")
    echo "Response: $(echo $RESP | head -c 500)"
    IMG_URL6=$(echo $RESP | grep -o 'https://[^"]*\.png' || echo "")
    if [ -n "$IMG_URL6" ]; then
        echo "Image URL: $IMG_URL6"
        echo "Status: [/] PASS"
    else
        echo "Status: [x] FAIL - No image URL"
    fi
else
    echo "Status: [x] SKIP - Missing URL or mask"
fi
echo ""

# Test 7: Inpainting with Local File Path
echo "========================================"
echo "7. Inpainting with Local File Path"
echo "========================================"
if [ -f "$TEST_IMAGE_PATH" ] && [ -f "$MASK_PATH" ]; then
    RESP=$(mcp_request "tools/call" "{\"name\":\"run_models\",\"arguments\":{\"model_id\":\"@cf/stabilityai/stable-diffusion-xl-base-1.0\",\"prompt\":\"Add a dragon in the sky\",\"image\":\"$TEST_IMAGE_PATH\",\"mask\":\"$MASK_PATH\",\"strength\":0.9,\"n\":1,\"size\":\"512x512\"}}" "7")
    echo "Response: $(echo $RESP | head -c 500)"
    IMG_URL7=$(echo $RESP | grep -o 'https://[^"]*\.png' || echo "")
    if [ -n "$IMG_URL7" ]; then
        echo "Image URL: $IMG_URL7"
        echo "Status: [/] PASS"
    else
        echo "Status: [x] FAIL - No image URL"
    fi
else
    echo "Status: [x] SKIP - Files not found"
fi
echo ""

# Test 8: Error Handling - Non-img2img model with image
echo "========================================"
echo "8. Error Handling - Non-img2img model with image"
echo "========================================"
if [ -n "$TEST_IMAGE_DATA_URI" ]; then
    RESP=$(mcp_request "tools/call" "{\"name\":\"run_models\",\"arguments\":{\"model_id\":\"@cf/black-forest-labs/flux-1-schnell\",\"prompt\":\"test\",\"image\":\"$TEST_IMAGE_PATH\"}}" "8")
    echo "Response: $(echo $RESP | head -c 200)"
    if echo "$RESP" | grep -q "does not support"; then
        echo "Status: [/] PASS - Correctly rejected non-img2img model"
    else
        echo "Status: [x] FAIL - Should have rejected"
    fi
else
    echo "Status: [x] SKIP - No test image"
fi
echo ""

# Test 9: Error Handling - Non-inpainting model with mask
echo "========================================"
echo "9. Error Handling - Non-inpainting model with mask"
echo "========================================"
if [ -f "$MASK_PATH" ]; then
    RESP=$(mcp_request "tools/call" "{\"name\":\"run_models\",\"arguments\":{\"model_id\":\"@cf/bytedance/stable-diffusion-xl-lightning\",\"prompt\":\"test\",\"image\":\"$TEST_IMAGE_PATH\",\"mask\":\"$MASK_PATH\"}}" "9")
    echo "Response: $(echo $RESP | head -c 200)"
    if echo "$RESP" | grep -q "does not support inpainting"; then
        echo "Status: [/] PASS - Correctly rejected non-inpainting model"
    else
        echo "Status: [x] FAIL - Should have rejected"
    fi
else
    echo "Status: [x] SKIP - Mask not found"
fi
echo ""

# Test 10: FLUX img2img with URL
echo "========================================"
echo "10. FLUX Klein img2img with URL"
echo "========================================"
if [ -n "$IMG_URL" ]; then
    RESP=$(mcp_request "tools/call" "{\"name\":\"run_models\",\"arguments\":{\"model_id\":\"@cf/black-forest-labs/flux-2-klein-4b\",\"prompt\":\"Transform this scene into a fantasy artwork\",\"image\":\"$IMG_URL\",\"n\":1,\"size\":\"512x512\"}}" "10")
    echo "Response: $(echo $RESP | head -c 500)"
    IMG_URL10=$(echo $RESP | grep -o 'https://[^"]*\.png' || echo "")
    if [ -n "$IMG_URL10" ]; then
        echo "Image URL: $IMG_URL10"
        echo "Status: [/] PASS"
    else
        echo "Status: [x] FAIL - No image URL"
    fi
else
    echo "Status: [x] SKIP - No previous image URL"
fi
echo ""

# Verify some generated images
echo "========================================"
echo "Verifying Generated Images"
echo "========================================"
for url in $IMG_URL $IMG_URL4 $IMG_URL5 $IMG_URL6 $IMG_URL7 $IMG_URL10; do
    if [ -n "$url" ]; then
        echo -n "Checking $url ... "
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "ERROR")
        if [ "$HTTP_CODE" = "200" ]; then
            echo "OK (200)"
        else
            echo "FAIL ($HTTP_CODE)"
        fi
    fi
done
echo ""

echo "========================================"
echo "All Tests Completed!"
echo "========================================"
