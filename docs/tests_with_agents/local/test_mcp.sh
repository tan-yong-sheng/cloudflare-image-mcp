#!/bin/bash
# MCP Test Script for Local Server
# Tests streamable HTTP MCP at http://localhost:3000/mcp

set -e

BASE_URL="http://localhost:3000/mcp"
MCP_ENDPOINT="$BASE_URL"

echo "========================================"
echo "MCP Streamable HTTP Test Script"
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

echo "1. Testing Initialize..."
INIT_RESP=$(mcp_request "initialize" "{}" "1")
echo "$INIT_RESP" | head -c 300
echo "..."
echo ""
echo "========================================"
echo ""

echo "2. Testing tools/list..."
TOOLS_RESP=$(mcp_request "tools/list" "{}" "2")
echo "Tools response (truncated):"
echo "$TOOLS_RESP" | head -c 1000
echo ""
echo "========================================"
echo ""

# Extract tool names
RUN_MODELS_EXISTS=$(echo "$TOOLS_RESP" | grep -c "run_models" || true)
LIST_MODELS_EXISTS=$(echo "$TOOLS_RESP" | grep -c "list_models" || true)
DESCRIBE_MODEL_EXISTS=$(echo "$TOOLS_RESP" | grep -c "describe_model" || true)

echo "Tool Check:"
echo "  - run_models: $RUN_MODELS_EXISTS"
echo "  - list_models: $LIST_MODELS_EXISTS"
echo "  - describe_model: $DESCRIBE_MODEL_EXISTS"
echo ""
echo "========================================"
echo ""

echo "3. Testing list_models tool..."
LIST_RESP=$(mcp_request "tools/call" "{\"name\":\"list_models\",\"arguments\":{}}" "3")
echo "list_models response:"
echo "$LIST_RESP" | head -c 2000
echo ""
echo "========================================"
echo ""

echo "4. Testing describe_model tool (flux-1-schnell)..."
DESCRIBE_RESP=$(mcp_request "tools/call" "{\"name\":\"describe_model\",\"arguments\":{\"model_id\":\"@cf/black-forest-labs/flux-1-schnell\"}}" "4")
echo "describe_model response:"
echo "$DESCRIBE_RESP" | head -c 2000
echo ""
echo "========================================"
echo ""

echo "5. Testing describe_model tool (SDXL Base)..."
DESCRIBE_SDXL=$(mcp_request "tools/call" "{\"name\":\"describe_model\",\"arguments\":{\"model_id\":\"@cf/stabilityai/stable-diffusion-xl-base-1.0\"}}" "5")
echo "describe_model (SDXL) response:"
echo "$DESCRIBE_SDXL" | head -c 2000
echo ""
echo "========================================"
echo ""

echo "6. Testing run_models tool (text-to-image)..."
RUN_RESP=$(mcp_request "tools/call" "{\"name\":\"run_models\",\"arguments\":{\"model_id\":\"@cf/black-forest-labs/flux-1-schnell\",\"prompt\":\"a cute robot reading a book\",\"n\":1,\"size\":\"512x512\"}}" "6")
echo "run_models response:"
echo "$RUN_RESP" | head -c 500
echo ""
echo "========================================"
echo ""

echo "7. Testing run_models with invalid model_id..."
INVALID_RESP=$(mcp_request "tools/call" "{\"name\":\"run_models\",\"arguments\":{\"model_id\":\"invalid-model\",\"prompt\":\"test\"}}" "7")
echo "Invalid model_id response:"
echo "$INVALID_RESP" | head -c 500
echo ""
echo "========================================"
echo ""

echo "All tests completed!"
echo ""
echo "Summary:"
echo "- MCP HTTP endpoint: $(curl -s -o /dev/null -w "%{http_code}" -X POST "$MCP_ENDPOINT" -H "Content-Type: application/json" -d '{"method":"initialize","params":{}}' && echo " OK" || echo " FAIL")"
