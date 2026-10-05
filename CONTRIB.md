# Contributing Guide

For project overview, tech stack, and layout see `README.md`.
For code conventions when editing `workers/src` see `CODING_STANDARDS.md`.

## Available Scripts

### workers/

| Script                          | Description                                 |
| ------------------------------- | ------------------------------------------- |
| `npx wrangler dev`              | Start local dev server                      |
| `npx wrangler dev --remote`     | Dev server with remote Cloudflare resources |
| `npx wrangler deploy`           | Deploy to Cloudflare                        |
| `npx wrangler deploy --dry-run` | Test deployment without publishing          |

## Development Workflow

### 1. Clone and Install

```bash
git clone https://github.com/tan-yong-sheng/cloudflare-image-mcp.git
cd cloudflare-image-mcp

cd workers && npm ci && cd ..
cd e2e && npm ci && cd ..
```

### 2. Set Up Environment Variables

For local development (wrangler):

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

R2 + AI are configured via `workers/wrangler.toml` bindings for local development. In CI, `workers/wrangler.toml` is generated dynamically by `.github/workflows/deploy-workers.yml`.

### 3. Develop and Test

```bash
# Type check
cd workers && npm ci && npm run check

# Dev (remote bindings)
cd workers && npx wrangler dev --remote
```

## Adding New Models

To add a new Cloudflare Workers AI text-to-image model, use the Claude Code skill:

```bash
# In Claude Code, use the skill:
Skill: add-cf-models
```

Or follow the guide in `.agents/skills/add-cf-models/SKILL.md`.

### Quick Steps

1. **Add model configuration** to `workers/src/config/models.json` (source of truth)
2. **Mirror changes** to `workers/src/config/models.ts` (TypeScript runtime)
3. **Update frontend dropdown** in `workers/src/endpoints/frontend.ts`
4. **Type check and deploy**

```bash
cd workers && npm run check
git add . && git commit -m "Add @cf/provider/model-name"
git push origin <branch> # `main` is protected — open a PR
```

### Model Configuration Files

| File                                | Purpose                                                  |
| ----------------------------------- | -------------------------------------------------------- |
| `workers/src/config/models.json`    | Source of truth - JSON schema with all model definitions |
| `workers/src/config/models.ts`      | TypeScript runtime config (mirror of JSON)               |
| `workers/src/endpoints/frontend.ts` | Frontend HTML with model dropdown                        |

See the skill documentation for detailed parameter definitions and examples.

## Code Style

See `CODING_STANDARDS.md`. Local gates (`lefthook.yml`): pre-commit runs
prettier on staged files; pre-push runs `workers` typecheck (`npm run check`).

## Testing

E2E tests run against Workers environments.

```bash
npm run test:e2e:staging
# or
npm run test:e2e:production
```

## Troubleshooting

### TypeScript Errors

Run type checking to identify issues:

```bash
cd workers && npm run check
```

### Cloudflare API Errors

Ensure your API token has the following permissions:

- `Workers AI: Read`
- `Workers AI: Write` (for image generation)
- `Account R2: Read/Write` (for storage)

### R2 Access Issues

Verify your R2 endpoint and credentials in `.env`. The endpoint should be:

```
https://<account-id>.r2.cloudflarestorage.com
```
