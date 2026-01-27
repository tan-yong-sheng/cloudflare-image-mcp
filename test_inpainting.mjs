import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'http://localhost:3000';

// Read image as base64 (raw, no data URI prefix for Cloudflare API)
function imageToBase64(filePath) {
  const content = fs.readFileSync(filePath);
  return content.toString('base64');
}

function makeRequest(endpoint, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, BASE_URL);
    const body = JSON.stringify(data);

    const req = http.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const TEST_IMAGE = path.join(__dirname, 'test_images/white-cloud-blue-sky-sea.jpg');
  const imageB64 = imageToBase64(TEST_IMAGE);

  console.log('=== INPAINTING TESTS (JSON format with image_b64 + mask) ===\n');

  // Test 1: SDXL Inpainting with JSON format
  console.log('1. SDXL Inpainting (JSON format)...');
  const r1 = await makeRequest('/v1/images/edits', {
    model: '@cf/stabilityai/stable-diffusion-xl-base-1.0',
    prompt: 'Replace the background with a tropical beach',
    n: 1,
    size: '512x512',
    strength: 0.9,
    image_b64: imageB64,
    mask: imageB64
  });
  console.log(`Status: ${r1.status}`);
  console.log(`Response: ${r1.body.substring(0, 500)}\n`);

  // Test 2: SD 1.5 Inpainting with JSON format
  console.log('2. SD 1.5 Inpainting (JSON format)...');
  const r2 = await makeRequest('/v1/images/edits', {
    model: '@cf/runwayml/stable-diffusion-v1-5-inpainting',
    prompt: 'Replace with a dragon',
    n: 1,
    size: '512x512',
    strength: 0.9,
    image_b64: imageB64,
    mask: imageB64
  });
  console.log(`Status: ${r2.status}`);
  console.log(`Response: ${r2.body.substring(0, 500)}\n`);

  console.log('=== IMAGE-TO-IMAGE TESTS (JSON format with image_b64, no mask) ===\n');

  // Test 3: SDXL Image-to-Image (no mask)
  console.log('3. SDXL Image-to-Image (no mask)...');
  const r3 = await makeRequest('/v1/images/edits', {
    model: '@cf/stabilityai/stable-diffusion-xl-base-1.0',
    prompt: 'Transform into a winter wonderland scene',
    n: 1,
    size: '512x512',
    strength: 0.7,
    image_b64: imageB64
  });
  console.log(`Status: ${r3.status}`);
  console.log(`Response: ${r3.body.substring(0, 500)}\n`);

  // Test 4: @cf/lykon/dreamshaper-8-lcm Image-to-Image (no mask)
  console.log('4. @cf/lykon/dreamshaper-8-lcm Image-to-Image (no mask)...');
  const r4 = await makeRequest('/v1/images/edits', {
    model: '@cf/lykon/dreamshaper-8-lcm',
    prompt: 'Make this look like an oil painting',
    n: 1,
    size: '512x512',
    strength: 0.5,
    image_b64: imageB64
  });
  console.log(`Status: ${r4.status}`);
  console.log(`Response: ${r4.body.substring(0, 500)}\n`);

  // Test 5: SD 1.5 Image-to-Image
  console.log('5. SD 1.5 Image-to-Image...');
  const r5 = await makeRequest('/v1/images/edits', {
    model: '@cf/runwayml/stable-diffusion-v1-5-img2img',
    prompt: 'Transform into a cyberpunk character',
    n: 1,
    size: '512x512',
    strength: 0.6,
    image_b64: imageB64
  });
  console.log(`Status: ${r5.status}`);
  console.log(`Response: ${r5.body.substring(0, 500)}\n`);

  console.log('=== FLUX MODELS (multipart format) ===\n');

  // Test FLUX with multipart - need to use the multipart endpoint
  // FLUX models expect multipart form data with image file
  // But our local server needs to handle this correctly

  console.log('=== SUMMARY ===');
  const results = [
    { name: 'SDXL Inpainting', status: r1.status },
    { name: 'SD 1.5 Inpainting', status: r2.status },
    { name: 'SDXL Img2Img', status: r3.status },
    { name: '@cf/lykon/dreamshaper-8-lcm Img2Img', status: r4.status },
    { name: 'SD 1.5 Img2Img', status: r5.status },
  ];

  for (const r of results) {
    console.log(`${r.name}: ${r.status === 200 ? 'PASS' : 'FAIL'} (${r.status})`);
  }
}

main().catch(console.error);
