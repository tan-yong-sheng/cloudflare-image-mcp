# Coding Standards

Observed conventions in `workers/src`. For workflow, scripts, and model-add
steps see `CONTRIB.md`. For deployment secrets see
`.github/workflows/deploy-workers.yml` (source of truth).

## Error envelopes (per surface — do not mix)

- **OpenAI REST**: `{ error: { message, type, param?, code: null } }`.
  400 missing prompt (`endpoints/openai-endpoint.ts:97-107`,
  `type:'invalid_request_error'`); 400 edits missing input (`:257-262`);
  500 service failure (`:283-284`, `:410-411`, `type:'api_error'`);
  catch-all helper `errorResponse` (`:484-495`).
- **Worker top level** (`index.ts:140-153`): 404 `{ error:'Not found' }`;
  500 `{ error:'Internal server error', message }`. Image proxy is the only
  plain-text exception (`'Image not found'` / `'Error fetching image'`,
  `index.ts:~126-138`).
- **Auth**: 401 `{ error:'Unauthorized', message }` +
  `WWW-Authenticate: Bearer` (`middleware/auth.ts`).
- **MCP/JSON-RPC**: always HTTP 200 with
  `{ jsonrpc:'2.0', id, error:{code,message} }`
  (`endpoints/mcp-endpoint.ts:194,203,280,299-305`).
- Message extraction everywhere:
  `error instanceof Error ? error.message : String(error)`
  (`openai-endpoint.ts:485`, `index.ts:149`).
- Known inconsistency (standardize when touching):
  `openai-endpoint.ts:78` and `mcp-endpoint.ts:95` return bare
  `{ error:'Not found' }` instead of their surface's wrapped shape.

## Auth idiom (`middleware/auth.ts`, wired in `index.ts:32-38`)

```ts
if (requiresAuth(path, request.method)) {
  const r = authenticateRequest(request, env);
  if (!r.authenticated) return createUnauthorizedResponse(r.error);
}
```

Open-by-default: no `env.API_KEYS` → authenticated. Otherwise
`Authorization: Bearer <token>` split-and-compare against
`env.API_KEYS.split(',').map(trim).filter(Boolean)`.
Public: `OPTIONS` always; exact `/`, `/index.html`, `/health`;
prefix `/images/`; exact `/api/internal/models`. Everything else
requires auth when `API_KEYS` is set.

## Validation idiom (hand-rolled — no zod at runtime)

`zod` is in `workers/package.json` but has zero runtime imports in
`workers/src`. Do not cite it as convention (use-or-remove is open).
Use `ParamParser.parse(input, explicitParams, modelConfig)`
(`services/param-parser.ts:22-`): object→`parseObject`,
string→`parseString` (`--key=value`, regex at `:47`); merge
`{...embedded, ...explicitParams}` — explicit JSON wins.
Bounds via `parseInteger`/`parseNumber` (`:231-256`) and `parseSize`
WxH regex (`:218-229`), which throw plain `Error`; endpoints map these
to the 400 envelope _before_ the service call. Clamp to
`modelConfig.limits` (`maxSteps`, min/max w/h).

## Logging (no logger lib — `console` only, by severity)

- `console.error` = failed operation (`index.ts:146`,
  `services/image-generator.ts:279`, `services/r2-storage.ts:292`).
- `console.warn` = degraded-config fallback only
  (`image-generator.ts:98,103,110`, `AI_ACCOUNTS` fallback).
- `console.log` = cron summary only (`index.ts:163`).
  No request logging, no structured logger.

## Naming / layout

`index.ts` (router) → `endpoints/*Endpoint.handle(request)` →
`services/*Service` + static `ParamParser` → `middleware/auth.ts` →
`config/models.{json,ts}` → `types.ts` (all shared interfaces + `Env`).
Files kebab-case; classes `*Endpoint/*Service/ParamParser/R2StorageService`;
interfaces PascalCase; functions camelCase; `MODEL_CONFIGS` UPPER_SNAKE.
Imports always use `.js` extensions with `import type` for types-only.
Comments: `// ===…===` file banner + purpose line; JSDoc on exports;
inline `// Route:` / `// Validate required fields` markers.

## Mechanical rules vs judgement calls

Mechanical: `.js` import extensions; `import type` for types;
`npm run check` (strict TS, ES2022, WebWorker lib) as gate;
`models.json` source of truth mirrored in `models.ts`;
secrets only via `wrangler secret put`, never committed;
never commit generated `wrangler.toml`; JSON-RPC errors always HTTP 200;
never let `throw` cross an endpoint boundary (map via
`errorResponse`/catch); responses built as
`new Response(JSON.stringify(…), { status, headers:
{ …corsHeaders, 'Content-Type':'application/json' } })`.
Judgement: new endpoint vs service-method extension; prompt-embedded vs
explicit params; fallback-with-`warn` vs hard 400/500; plain-text vs JSON
for `/images/*`; deduping the two `corsHeaders` definitions
(`openai-endpoint.ts:36-40` vs `index.ts:18-22`).
