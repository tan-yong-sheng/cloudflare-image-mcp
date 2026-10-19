# Contributing Guide

For project overview, tech stack, and layout see `README.md`.
For code conventions when editing `workers/src` see `CODING_STANDARDS.md`.

## Available Scripts

### workers/

| Script                           | Description                                 |
| -------------------------------- | ------------------------------------------- |
| `npx wrangler dev`               | Start local dev server                      |
| `npm run dev:local` (in workers) | Same as `wrangler dev --local --port 8787`  |
| `npx wrangler dev --remote`      | Dev server with remote Cloudflare resources |
| `npx wrangler deploy`            | Deploy to Cloudflare                        |
| `npx wrangler deploy --dry-run`  | Test deployment without publishing          |

### scripts/

| Script                        | Description                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/verify-admin-api.sh` | Cross-check the `/api/admin/*` contract of a running Worker. Takes `BASE_URL`, `API_KEY`, `ADMIN_KEY`; `WRITES=0` is read-only. |

## Development Workflow

### 1. Clone and Install

```bash
git clone https://github.com/tan-yong-sheng/cloudflare-image-mcp.git
cd cloudflare-image-mcp

cd workers && npm ci && cd ..
cd e2e && npm ci && cd ..
```

### 2. Configure the Worker

`workers/wrangler.toml` and `workers/.dev.vars` are gitignored — CI generates
the manifest from GitHub Secrets at deploy time and deletes it afterwards, and
`.dev.vars` is the file wrangler reads for local secrets. Each checkout builds
its own pair from the templates:

```bash
cd workers
cp wrangler.toml.example wrangler.toml
cp .dev.vars.example .dev.vars
```

Both templates hold throwaway placeholders and are checked by
`src/dev-config.test.ts`: the manifest must keep the binding names the deploy
workflow generates, and no value in the secrets template may look like a real
credential. Never put a real credential in either copied file.

Apply the D1 schema locally, then start the dev server:

```bash
cd workers
npx wrangler d1 migrations apply PROVIDER_DB --local
npx wrangler dev            # local bindings, local D1 under workers/.wrangler/
```

`wrangler dev --remote` runs against real Cloudflare resources instead, which
needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

### 3. Develop and Test

```bash
# Type check
cd workers && npm ci && npm run check

# Unit tests
cd workers && npm test

# Dev (remote bindings)
cd workers && npx wrangler dev --remote

# Cross-check a running Worker's /api/admin/* contract (local or deployed)
BASE_URL=http://127.0.0.1:8787 API_KEY=local-dev-user-key \
  ADMIN_KEY=local-dev-admin-key scripts/verify-admin-api.sh
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
2. **Regenerate the registry**: `cd workers && npm run models:gen`
3. **Type check and deploy**

```bash
cd workers && npm run check   # also fails if the generated registry is stale
git add . && git commit -m "Add @cf/provider/model-name"
git push origin <branch> # `main` is protected — open a PR
```

### Model Configuration Files

| File                                     | Purpose                                                  |
| ---------------------------------------- | -------------------------------------------------------- |
| `workers/src/config/models.json`         | Source of truth - all model definitions                  |
| `workers/src/config/models.generated.ts` | Generated registry (`npm run models:gen`) - never edited |
| `workers/src/config/models.ts`           | Hand-written registry access (lookup, exposure, listing) |
| `client/src/api/models.ts`               | Frontend model registry client (the dropdown reads it)   |

See the skill documentation for detailed parameter definitions and examples.

## Code Style

See `CODING_STANDARDS.md`. Local gates (`lefthook.yml`): pre-commit runs
prettier `--write` on staged files **and re-stages the result** — always
`git diff --cached` after committing, and write commit messages to survive
reformatting (describe intent, never quote the diff's exact style).
Pre-push runs `workers` typecheck (`npm run check`).
Invoke prettier only via `workers/node_modules/.bin/prettier` — bare `npx`
may resolve a different major with different formatting.

Releases: bump `workers/package.json` `version` on main; `tag-release.yml`
mints the tag automatically (never hand-tag). Full procedure:
`docs/RELEASING.md`.

## Testing

Unit tests are pure logic, run from the repo root with no backend needed:

```bash
npm --prefix workers ci # once per checkout
npm --prefix client ci  # once per checkout
npm run test:unit       # both suites (~5s)
```

Derivation of that count: every `*.test.ts` under `workers/src` — registry +
JSON mirror, MCP handler/tool/SDK suites, generator service, auth gate, param
parser, R2 storage, utilities, and the D1 provider-schema suites — plus every
`*.test.ts` and `*.test.tsx` under `client/src` — the React client's
workbench, generator, API clients, theme, routing, and build layout. It moves
whenever a suite or case is added or removed; `npm run test:unit` prints the
authoritative numbers, so treat a count as a rough scale indicator only.

`npm run test:unit:workers` and `npm run test:unit:client` run one suite
each. The client is a separate package with its own lockfile, so it needs
its own `npm ci`.

E2E tests run against Workers environments.

```bash
npm run test:e2e:staging
# or
npm run test:e2e:production
```

## Troubleshooting

### Sandbox credential injection vs live auth

In-sandbox requests to `image.tanyongsheng.qzz.io` (production alias of
`cloudflare-image-workers.<subdomain>.workers.dev`) carry an injected
`Authorization` header via the nono profile — the direct `workers.dev`
host has no injection. So: in-sandbox curl/browser to the alias is
always _authenticated_; to test unauthenticated behavior, use
`curl -v` (inspect request headers for injected auth) or run
outside the sandbox. Never mistake an in-sandbox 200 for an open gate.

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
