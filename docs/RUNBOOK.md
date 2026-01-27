# Operations Runbook

## Deployment Procedures

### Local Deployment (Docker)

```bash
cd packages/local

# Build image
docker build -t cloudflare-image-mcp .

# Run container
docker run -d \
  --name cloudflare-image-mcp \
  -p 3000:3000 \
  --env-file .env \
  cloudflare-image-mcp

# Check logs
docker logs -f cloudflare-image-mcp

# Stop container
docker stop cloudflare-image-mcp
docker rm cloudflare-image-mcp
```

### Cloudflare Workers Deployment

```bash
cd workers

# Deploy to production
npx wrangler deploy

# Deploy with preview (staging)
npx wrangler deploy --env staging

# Dry run (validate without deploying)
npx wrangler deploy --dry-run
```

### Local Development Server

```bash
# Local package (Express server)
cd packages/local
npm run dev

# Workers (local emulation)
cd workers
npx wrangler dev

# Workers with remote resources
npx wrangler dev --remote
```

## Monitoring

### Health Endpoints

| Deployment | Endpoint |
|------------|----------|
| Local | `http://localhost:3000/health` |
| Workers | `https://<worker>.<subdomain>.workers.dev/health` |

### Expected Health Response

```json
{
  "status": "healthy",
  "timestamp": 1234567890,
  "version": "0.1.0"
}
```

### Logs

**Local:**
```bash
# Container logs
docker logs cloudflare-image-mcp

# Dev server logs
cd packages/local && npm run dev
```

**Workers:**
```bash
# Real-time tail
npx wrangler tail

# View deployment logs
npx wrangler deployments
```

## Common Issues and Fixes

### Issue: `CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required`

**Cause:** Missing environment variables

**Fix:**
1. Create or update `.env` file in `packages/local/`
2. Add required credentials:
   ```
   CLOUDFLARE_API_TOKEN=your_token_here
   CLOUDFLARE_ACCOUNT_ID=your_account_id
   ```

### Issue: R2 bucket not accessible

**Cause:** Incorrect R2 credentials or endpoint

**Fix:**
1. Verify R2 endpoint format: `https://<account-id>.r2.cloudflarestorage.com`
2. Ensure API token has R2 permissions
3. Check bucket name matches exactly

### Issue: Image generation fails with "model not found"

**Cause:** Invalid model ID

**Fix:**
1. List available models: `GET /v1/models`
2. Use correct full model ID (e.g., `@cf/black-forest-labs/flux-1-schnell`)

### Issue: Workers deployment fails

**Cause:** Compatibility date or missing bindings

**Fix:**
1. Update compatibility date in `wrangler.toml`
2. Ensure all bindings (R2, AI) are configured
3. Run `npx wrangler deploy --dry-run` to diagnose

### Issue: CORS errors in web UI

**Cause:** CORS not configured for frontend domain

**Fix:**
The server already has CORS enabled for all origins. If issues persist:
1. Check browser console for specific CORS errors
2. Verify request includes `Origin` header if required

## Rollback Procedures

### Local Deployment

```bash
# Stop current container
docker stop cloudflare-image-mcp

# Remove container
docker rm cloudflare-image-mcp

# Run previous version
docker run -d \
  --name cloudflare-image-mcp \
  -p 3000:3000 \
  --env-file .env \
  cloudflare-image-mcp:previous-tag
```

### Cloudflare Workers

```bash
# List previous deployments
npx wrangler deployments

# Rollback to specific version
npx wrangler rollback --version-id <version-id>
```

## Scaling Considerations

### Local Deployment

- Single container by default
- Add reverse proxy (nginx) for load balancing
- Consider container orchestration (Kubernetes, Docker Swarm)

### Workers Deployment

- Automatically scales with request volume
- R2 storage scales automatically
- Monitor Workers AI rate limits

## Security

### API Token Permissions

Required permissions for `CLOUDFLARE_API_TOKEN`:

| Permission | Reason |
|------------|--------|
| `Workers AI: Read` | List available models |
| `Workers AI: Write` | Generate images |
| `Account R2: Read` | List/delete images |
| `Account R2: Write` | Upload images |

### R2 API Token

Create a separate R2 API token with:
- Object Read permissions
- Object Write permissions

### Environment Variables

- Never commit `.env` files
- Use Cloudflare Secrets for Workers:
  ```bash
  npx wrangler secret put CLOUDFLARE_API_TOKEN
  ```

## Performance

### Local Server

- Default port: 3000
- Increase `NODE_OPTIONS` for more memory:
  ```bash
  NODE_OPTIONS="--max-old-space-size=4096" npm start
  ```

### Workers

- 10ms CPU time limit per request
- 1MB response size limit
- Use `waitUntil` for background tasks

## Backup and Recovery

### R2 Images

R2 provides:
- Automatic replication across data centers
- No additional backup needed for image storage
- Consider lifecycle rules for auto-expiry

### Configuration

- Store `.env` files securely
- Document required credentials
- Keep backup of wrangler.toml
