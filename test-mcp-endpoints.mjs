#!/usr/bin/env node

/**
 * Test MCP HTTP endpoint structure
 * Tests that endpoints respond correctly without requiring API credentials
 */

import http from 'http';

const BASE_URL = 'http://localhost:3000';
const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

async function makeRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      const bodyStr = JSON.stringify(body);
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : null;
          resolve({ status: res.statusCode, data: json, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data, headers: res.headers });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// Tests
test('Health check endpoint', async () => {
  const res = await makeRequest('/health');
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  if (!res.data.status) throw new Error('No status in response');
});

test('API info endpoint', async () => {
  const res = await makeRequest('/api');
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  if (!res.data.endpoints) throw new Error('No endpoints in response');
});

test('List models endpoint', async () => {
  const res = await makeRequest('/api/internal/models');
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  if (!Array.isArray(res.data)) throw new Error('Response is not an array');
  if (res.data.length === 0) throw new Error('No models returned');
});

test('MCP info endpoint', async () => {
  const res = await makeRequest('/mcp', 'GET');
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  if (res.headers['content-type'] !== 'text/event-stream') {
    // It's the info endpoint
    if (!res.data.name) throw new Error('No name in response');
  }
});

test('MCP initialize', async () => {
  const res = await makeRequest('/mcp', 'POST', {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {},
  });
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  if (!res.data.result) throw new Error('No result in response');
  if (!res.data.result.capabilities) throw new Error('No capabilities in response');
});

test('MCP tools/list', async () => {
  const res = await makeRequest('/mcp', 'POST', {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {},
  });
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  if (!res.data.result) throw new Error('No result in response');
  if (!res.data.result.tools) throw new Error('No tools in response');
  if (res.data.result.tools.length < 3) throw new Error('Expected at least 3 tools');
});

test('Frontend serves HTML', async () => {
  const res = await makeRequest('/');
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  if (!res.data.includes('<html')) throw new Error('Not HTML content');
});

// Run tests
async function runTests() {
  console.log('🧪 Testing MCP HTTP Endpoints\n');
  console.log(`Server: ${BASE_URL}\n`);

  // Check if server is running
  try {
    await makeRequest('/health');
  } catch (e) {
    console.error('❌ Server is not running at', BASE_URL);
    console.error('   Start server with: cd packages/local && npm run dev');
    process.exit(1);
  }

  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`✅ ${name}`);
      passed++;
    } catch (e) {
      console.log(`❌ ${name}`);
      console.log(`   ${e.message}`);
      failed++;
    }
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Test runner error:', e);
  process.exit(1);
});
