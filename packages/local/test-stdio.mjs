#!/usr/bin/env node
/**
 * Test script for MCP stdio server
 * Initializes the server with config, AI client, and storage
 */

import { fileURLToPath } from 'url';
import { dirname } from 'path';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import from core and local
import * as core from '@cloudflare-image-mcp/core';
import { createStdioMCPServer } from './dist/mcp/stdio.js';

async function runStdioTest() {
  console.log('=== MCP Stdio Server Test ===\n');

  try {
    // Initialize the AI client and storage
    console.log('Initializing AI client...');
    const aiClient = core.createCloudflareAIClient({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
      apiToken: process.env.CLOUDFLARE_API_TOKEN || '',
    });

    console.log('Initializing storage provider...');
    const storage = core.createS3StorageProvider({
      bucket: process.env.S3_BUCKET || '',
      region: 'auto',
      endpoint: process.env.S3_ENDPOINT || '',
      accessKey: process.env.S3_ACCESS_KEY || '',
      secretKey: process.env.S3_SECRET_KEY || '',
      cdnUrl: process.env.S3_CDN_URL || '',
    });

    const config = {
      ...core.defaultConfig,
      defaultModel: '@cf/black-forest-labs/flux-1-schnell',
    };

    console.log('Starting MCP stdio server...');
    console.log('(Server will run until you press Ctrl+C)\n');

    // Start the stdio server - this will keep the process alive
    await createStdioMCPServer(config, aiClient, storage);

  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

runStdioTest();
