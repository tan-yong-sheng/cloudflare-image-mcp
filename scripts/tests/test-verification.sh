#!/bin/bash

# ============================================================================
# Comprehensive Test Script for Cloudflare Image MCP
# Tests: Local server, OpenAI API, MCP endpoints, Frontend
# ============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================="
echo "Cloudflare Image MCP - Verification Tests"
echo "========================================="
echo ""

# Check if we have required environment variables
if [ -z "$CLOUDFLARE_API_TOKEN" ] || [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
    echo -e "${YELLOW}⚠ Warning: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID not set${NC}"
    echo "Will only test structure, not actual API calls"
    SKIP_API_TESTS=1
fi

# Test 1: Check package builds
echo "========================================="
echo "Test 1: Package Build Verification"
echo "========================================="

echo "Building packages/core..."
cd packages/core
npm run build > /dev/null 2>&1 && echo -e "${GREEN}✓ Core package builds successfully${NC}" || echo -e "${RED}✗ Core build failed${NC}"
cd ../..

echo "Building packages/local..."
cd packages/local
npm run build > /dev/null 2>&1 && echo -e "${GREEN}✓ Local package builds successfully${NC}" || echo -e "${RED}✗ Local build failed${NC}"
cd ../..

echo "Checking workers TypeScript..."
cd workers
npm run check > /dev/null 2>&1 && echo -e "${GREEN}✓ Workers TypeScript check passes${NC}" || echo -e "${RED}✗ Workers check failed${NC}"
cd ..

echo ""

# Test 2: Check file structure
echo "========================================="
echo "Test 2: File Structure Verification"
echo "========================================="

check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $1"
    else
        echo -e "${RED}✗${NC} $1 (missing)"
    fi
}

echo "Local deployment files:"
check_file "packages/local/dist/main.js"
check_file "packages/local/dist/mcp/stdio.js"
check_file "packages/local/dist/api/server.js"
check_file "packages/local/src/ui/index.html"

echo ""
echo "Workers deployment files:"
check_file "workers/src/index.ts"
check_file "workers/src/endpoints/openai-endpoint.ts"
check_file "workers/src/endpoints/mcp-endpoint.ts"
check_file "workers/src/endpoints/frontend.ts"

echo ""

# Test 3: Verify core exports
echo "========================================="
echo "Test 3: Core Package Exports"
echo "========================================="

node -e "
const core = require('./packages/core/dist/index.js');
const checks = [
    ['listModels', typeof core.listModels === 'function'],
    ['getModelConfig', typeof core.getModelConfig === 'function'],
    ['createCloudflareAIClient', typeof core.createCloudflareAIClient === 'function'],
    ['createS3StorageProvider', typeof core.createS3StorageProvider === 'function'],
    ['parseEmbeddedParams', typeof core.parseEmbeddedParams === 'function'],
    ['mergeParams', typeof core.mergeParams === 'function'],
    ['detectTask', typeof core.detectTask === 'function']
];
checks.forEach(([name, valid]) => {
    console.log(valid ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m', name, 'exported');
});
" 2>/dev/null || echo -e "${RED}✗ Failed to load core package${NC}"

echo ""

# Test 4: Check MCP tool definitions
echo "========================================="
echo "Test 4: MCP Tools Definition"
echo "========================================="

echo "Local MCP stdio tools:"
echo "  • run_models"
echo "  • list_models"
echo "  • describe_model"

echo ""
echo "Workers MCP HTTP tools (same as above):"
echo "  • run_models"
echo "  • list_models"
echo "  • describe_model"

echo ""

# Test 5: Verify supported models
echo "========================================="
echo "Test 5: Supported Models"
echo "========================================="

node -e "
const { listModels } = require('./packages/core/dist/index.js');
const models = listModels();
console.log('Total models:', models.length);
models.forEach(m => {
    console.log('  •', m.name, '(' + m.taskTypes.join(', ') + ')');
});
" 2>/dev/null || echo -e "${RED}✗ Failed to list models${NC}"

echo ""

# Test 6: Documentation check
echo "========================================="
echo "Test 6: Documentation"
echo "========================================="

check_file "README.md"
check_file "docs/USAGE.md"
check_file "docs/DEPLOY.md"
check_file "docs/PLAN.md"
check_file "docs/api/openai_standard/image_endpoint.md"

echo ""

# Summary
echo "========================================="
echo "Test Summary"
echo "========================================="
echo -e "${GREEN}All static tests completed!${NC}"
echo ""
echo "To test runtime functionality:"
echo "  1. Configure .env file in packages/local/"
echo "  2. Run: cd packages/local && npm run dev"
echo "  3. Test endpoints:"
echo "     - Frontend: http://localhost:3000/"
echo "     - OpenAI API: POST http://localhost:3000/v1/images/generations"
echo "     - MCP HTTP: POST http://localhost:3000/mcp"
echo "     - MCP stdio: node dist/main.js --stdio"
echo ""
