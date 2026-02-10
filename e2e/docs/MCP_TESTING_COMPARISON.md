# MCP Testing Evaluation: SDK vs Playwright vs mcporter

## Summary

This document compares different approaches for E2E testing the MCP server implementation.

## Current Test Approaches

### 1. Playwright Request API (Raw HTTP)
**Location:** `e2e/tests/mcp/tools.spec.ts`, `e2e/tests/mcp/initialize.spec.ts`

**Approach:**
```typescript
const response = await request.post('/mcp/message', {
  data: {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
  },
});
const body = await response.json();
expect(body.result.tools).toBeInstanceOf(Array);
```

**Pros:**
- Simple and direct
- No MCP-specific dependencies
- Fast (no client initialization overhead)
- Works well for HTTP/Streamable transport
- Good for testing raw protocol compliance

**Cons:**
- Tests at transport layer, not MCP protocol layer
- Manual JSON-RPC message construction
- No type safety for responses
- Limited to HTTP transport (no stdio testing)

### 2. MCP SDK Client (@modelcontextprotocol/sdk)
**Location:** `e2e/tests/mcp/mcp-sdk.spec.ts`

**Approach:**
```typescript
const client = new Client({ name: 'test-client', version: '1.0.0' });
const transport = new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`));
await client.connect(transport);

const tools = await client.listTools();
const result = await client.callTool({ name: 'run_model', arguments: {...} });
```

**Pros:**
- Official SDK maintained by MCP protocol team
- Native TypeScript support
- Programmatic API perfect for automated testing
- CI/CD ready (works in GitHub Actions)
- Handles protocol initialization automatically
- Type-safe with proper interfaces

**Cons:**
- Requires learning SDK API
- Type assertions needed for content (SDK returns `unknown[]`)
- Slightly more verbose than raw HTTP

### 3. mcporter (NOT RECOMMENDED)

**What it is:**
- TypeScript runtime, CLI, and code-generation toolkit for MCP
- Provides typed tool clients with TypeScript interfaces
- Can generate standalone CLIs from MCP server definitions

**Why NOT used:**
- Designed for CLI/tooling use, not testing
- Adds unnecessary abstraction layer for E2E tests
- Smaller community/ecosystem than official SDK
- Less documentation for testing scenarios
- Primary use case is client generation, not server testing

## Recommendation

### For E2E Testing: Use @modelcontextprotocol/sdk

**Why the official SDK is the best choice:**

1. **Official Support** - Maintained by the MCP protocol team, guaranteed compatibility
2. **CI/CD Integration** - Works seamlessly in GitHub Actions without interactive UI
3. **Type Safety** - TypeScript types for all MCP messages (with minor casting for content)
4. **Protocol Compliance** - Tests at the correct abstraction level
5. **Future-proof** - Will be updated as MCP spec evolves

### Test Strategy

Run both approaches in parallel:

```bash
# SDK-based tests (protocol-level validation)
npx playwright test tests/mcp/mcp-sdk.spec.ts

# HTTP-based tests (transport-level validation)
npx playwright test tests/mcp/tools.spec.ts tests/mcp/initialize.spec.ts
```

### SDK Test Structure

The SDK tests in `mcp-sdk.spec.ts` cover:

1. **Initialize** - Connection establishment
2. **listTools** - Tool discovery with schema validation
3. **callTool(list_models)** - Tool execution returning JSON
4. **callTool(describe_model)** - Tool with parameters
5. **callTool(run_model)** - Image generation
6. **Error handling** - Missing parameters
7. **Batch generation** - Multiple images (n=2)

### Type Pattern

When working with SDK responses:

```typescript
interface TextContent {
  type: 'text';
  text: string;
  isError?: boolean;
}

// Cast content array to proper type
const content = result.content as TextContent[];
```

## Running the Tests

```bash
# Against local server
cd e2e && npm test -- tests/mcp/mcp-sdk.spec.ts

# Against Cloudflare Workers
TEST_TARGET=workers npm test -- tests/mcp/mcp-sdk.spec.ts

# All MCP tests (both SDK and HTTP)
npm run test:mcp
```

## Future Considerations

- Keep both SDK and HTTP tests for comprehensive coverage
- SDK tests validate protocol semantics
- HTTP tests validate transport layer behavior
- If migrating to stdio transport, SDK tests would be easier to adapt
