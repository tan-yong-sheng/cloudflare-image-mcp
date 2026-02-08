import fs from 'fs';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;

if (!accountId || !apiToken) {
  console.error('Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN');
  process.exit(1);
}

const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/stabilityai/stable-diffusion-xl-base-1.0`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    prompt: 'a simple cat',
    image_b64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    strength: 0.5,
    num_steps: 10,
    width: 512,
    height: 512,
  }),
});

const text = await response.text();
console.log('Status:', response.status);
console.log('Response:', text.substring(0, 1000));
