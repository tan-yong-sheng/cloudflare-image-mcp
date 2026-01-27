#!/usr/bin/env node
/**
 * Notify hook wrapper for Claude Code → ntfy.sh (Node.js version).
 *
 * Usage (CLI args):
 *   node notify_hook.cjs \
 *     --priority default \
 *     --emoji white_check_mark \
 *     --title "Task Completed" \
 *     --message "Task completed successfully"
 *
 * Environment variables:
 *   NTFY_BASE_URL  e.g. https://ntfy.sh
 *   TOPIC          e.g. my-topic
 *   ACCESS_TOKEN   (optional) Bearer token for ntfy
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// Load .env (if present) but prefer process env
try {
  const dotenv = require('dotenv');
  dotenv.config({ path: '.env.dev', override: false });
} catch {
  // dotenv not installed, skip
}

// --- Args parsing ---
const args = require('minimist')(process.argv.slice(2), {
  string: ['priority', 'emoji', 'title', 'message', 'folder', 'branch', 'tags'],
  alias: { p: 'priority', e: 'emoji', t: 'title', m: 'message', f: 'folder', b: 'branch', T: 'tags' }
});

const priority = args.priority || 'default';
const emoji = args.emoji || 'bell';
const title = args.title || 'Notification';
const message = args.message || args.m || 'Notification';
const folderArg = args.folder || args.f || '.';
const branchArg = args.branch || args.b || '';
const customTags = args.tags || args.T || '';

// --- Branch detection (fallback) ---
function detectBranch(cwd) {
  try {
    const headPath = path.join(cwd, '.git', 'HEAD');
    if (fs.existsSync(headPath)) {
      const ref = fs.readFileSync(headPath, 'utf-8').trim();
      if (ref.startsWith('ref:')) {
        return ref.split('/').pop();
      }
    }
  } catch {
    // ignore
  }
  return '';
}

// --- Header sanitization ---

function sanitizeHeaderValue(s) {
  if (!s) return '';
  s = s.replace(/\u2014/g, '-').replace(/\u2013/g, '-');
  s = s.replace(/\u2018/g, "'").replace(/\u2019/g, "'");
  s = s.replace(/\u201c/g, '"').replace(/\u201d/g, '"');
  s = s.replace(/\u2026/g, '...');

  try {
    Buffer.from(s, 'latin-1');
    return s;
  } catch {
    const normalized = s.normalize('NFKD');
    const asciiBytes = Buffer.from(normalized, 'ascii');
    const asciiStr = asciiBytes.toString('ascii');
    if (asciiStr) return asciiStr;
    return normalized.normalize('NFKD').split('').map(c => {
      try {
        return c.charCodeAt(0) <= 255 ? c : '?';
      } catch {
        return '?';
      }
    }).join('');
  }
}

function sanitizeHeaders(obj) {
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k] = sanitizeHeaderValue(v);
  }
  return result;
}

// --- ntfy sender with retry ---

function sendToNtfy(ntfyUrl, topic, payloadText, accessToken, headersExtra = {}, retries = 2) {
  return new Promise((resolve, reject) => {
    const headers = {
      'Priority': 'default',
      'Markdown': 'yes',
      ...headersExtra,
    };
    Object.assign(headers, sanitizeHeaders(headersExtra));

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    let attempt = 0;
    const doRequest = () => {
      attempt++;
      const url = new URL(ntfyUrl);
      const client = url.protocol === 'https:' ? https : http;

      const req = client.request(url, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Length': Buffer.byteLength(payloadText),
        },
        timeout: 15000,
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log('Notification sent (ntfy)');
            resolve();
          } else if (attempt <= retries) {
            setTimeout(doRequest, 1000 * attempt);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', (e) => {
        if (attempt <= retries) {
          setTimeout(doRequest, 1000 * attempt);
        } else {
          reject(e);
        }
      });

      req.write(payloadText);
      req.end();
    };

    doRequest();
  });
}

// --- Main CLI ---

async function main() {
  const ntfyBaseUrl = process.env.NTFY_BASE_URL;
  const topic = process.env.TOPIC;
  const accessToken = process.env.ACCESS_TOKEN;

  if (!ntfyBaseUrl || !topic) {
    console.error('NTFY_BASE_URL and TOPIC must be set in environment');
    process.exit(3);
  }

  // Detect branch if not provided
  const cwd = process.cwd();
  const branch = branchArg || detectBranch(cwd);
  const folder = folderArg === '.' ? cwd : (folderArg || cwd);

  // Normalize message: replace newlines/multiple spaces with single space
  const normalizeText = (text) => {
    let normalized = text.replace(/\s+/g, ' ').trim();
    normalized = normalized.replace(/ - /g, ' -  ');
    return normalized;
  };

  const fullTitle = title;
  const timestampStr = new Date().toLocaleTimeString('en-US', { hour12: false });

  const messageLines = [
    `**${normalizeText(message)}**`,
    '',
    `- **Folder:** \`${folder.replace(/\\/g, '/')}\``,
  ];
  if (branch) {
    messageLines.push(`- **Branch:** \`${branch}\``);
  }

  const textPayload = messageLines.join('\n');

  const ntfyUrl = new URL(topic, ntfyBaseUrl.replace(/\/$/, '') + '/').toString();

  const headersExtra = {
    Title: fullTitle,
    Tags: customTags ? `${customTags},${emoji}` : (emoji || ''),
    Priority: priority,
  };

  try {
    await sendToNtfy(ntfyUrl, topic, textPayload, accessToken, headersExtra);
  } catch (e) {
    console.error(`Failed to send notification: ${e}`);
    process.exit(1);
  }

  console.log('Notification sent successfully');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
