# Troubleshooting / Known Issues

This project runs as a **Cloudflare Worker** (see `AGENTS.md`).

## Base URLs

- Local dev (wrangler): `http://localhost:8787`
- Production: `https://<your-worker>.workers.dev`

## MCP endpoint “not found”

If `/mcp` returns 404, check:

1) You are hitting the right port/URL:
- Local: `http://localhost:8787/mcp`
- Production: `https://<your-worker>.workers.dev/mcp`

2) You started the worker via Wrangler (see `docs/DEPLOY.md`).

## Masked edits ("inpainting")

"Inpainting" is treated as **image-to-image with a mask**.

- MCP model discovery exposes mask support via `edit_capabilities.mask`:
  - `supported` (mask accepted)
  - `required` (mask required)

## `/v1/images/edits` JSON body fields

For JSON requests to `/v1/images/edits`, you can supply either:
- `image` / `mask` (base64 strings)
- or `image_b64` / `mask_b64` (base64 strings)

Multipart form uploads (`-F image=@... -F mask=@...`) are also supported.

## E2E tests fail with https://example.invalid

The Playwright suite is intended to run against a real deployed Worker. Provide a real base URL / target configuration for `e2e/` (see `e2e/lib/target.ts` and `docs/E2E_TESTING.md`).
