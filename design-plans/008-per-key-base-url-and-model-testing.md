# Per-Key Base URL and Model Testing

**Status:** To-Spec (Awaiting React Migration)  
**Priority:** Medium  
**Blocked by:** Issue #96 (React migration)  
**Replaces:** Hardcoded Cloudflare Workers AI endpoint assumptions

## Feature Request (User Requirements)

From design feedback session:

> "can we have base url field, and custom model field (where we have 'fetch models' button to fetch models from /v1/models endpoint) ... and then have a 'test' button to run live api call to test if the model we choose is live or not"

## Problem Statement

Currently, the system assumes all provider keys target Cloudflare Workers AI at a fixed endpoint. This prevents:

- Using alternative AI providers with OpenAI-compatible APIs
- Using custom proxy endpoints or gateways
- Per-key model selection and validation
- Pre-deployment connectivity testing

Operators need:

1. **Custom base URL** per key (e.g., `https://custom-proxy.company.com/v1`)
2. **Model discovery** via "Fetch Models" button querying `/v1/models`
3. **Live connectivity testing** to verify credentials + model availability

## User Stories

1. As an operator, I want to configure a custom base URL per provider key, so that I can use alternative AI providers or proxy endpoints.
2. As an operator, I want to fetch the list of available models from the provider's `/v1/models` endpoint, so that I can see what models my credentials have access to.
3. As an operator, I want to select a specific model per key, so that different keys can serve different model tiers or specializations.
4. As an operator, I want to test connectivity with a live API call before saving the key, so that I can catch configuration errors immediately.
5. As an operator, I want to see clear success/failure feedback from the test, so that I know whether the credentials and model are working.
6. As a developer, I want base URLs to default to the standard Cloudflare endpoint, so that existing workflows continue to work without configuration.

## High-Level Solution

### Add to Admin Workbench Key Form

**New Fields:**

```
┌─────────────────────────────────────────────────┐
│ Edit Key #42 (cloudflare · v2)         [X]     │
├─────────────────────────────────────────────────┤
│                                                 │
│ Base URL                                        │
│ ┌─────────────────────────────────────────────┐ │
│ │ https://api.cloudflare.com/client/v4       │ │
│ └─────────────────────────────────────────────┘ │
│ Default: Cloudflare Workers AI endpoint         │
│                                                 │
│ Available Models             [Fetch Models]    │
│ ┌─────────────────────────────────────────────┐ │
│ │ @cf/meta/llama-3.1-8b-instruct       [▼]   │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ [Test Connection]                               │
│                                                 │
│ Cloudflare account ID                          │
│ ┌─────────────────────────────────────────────┐ │
│ │ eb998e8d...                                 │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ API token                                       │
│ ┌─────────────────────────────────────────────┐ │
│ │ ••••••••                           [👁]     │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ Weight: [1000]  ☑ Enabled                      │
│                                                 │
│ [Cancel]                          [Save]        │
└─────────────────────────────────────────────────┘
```

### Workflow

1. **Operator enters base URL** (optional, defaults to Cloudflare)
2. **Operator clicks "Fetch Models"**
   - Frontend calls backend with: `{ baseUrl, accountId, token }`
   - Backend makes GET request to `{baseUrl}/accounts/{accountId}/ai/models`
   - Returns list of available models
   - Frontend populates dropdown
3. **Operator selects a model** from dropdown
4. **Operator clicks "Test Connection"**
   - Frontend calls backend with: `{ baseUrl, accountId, token, modelId }`
   - Backend makes test inference call to `{baseUrl}/accounts/{accountId}/ai/run/{modelId}`
   - Returns success/failure + latency
   - Frontend shows: "✅ Connected (245ms)" or "❌ Failed: Invalid credentials"
5. **Operator saves key** with validated configuration

---

## Backend Changes Required

### 1. Database Schema

**Migration: `0004_per_key_base_url_model.sql`**

```sql
ALTER TABLE provider_keys ADD COLUMN base_url TEXT;
ALTER TABLE provider_keys ADD COLUMN model_id TEXT;

-- Default existing keys to Cloudflare endpoint
UPDATE provider_keys
SET base_url = 'https://api.cloudflare.com/client/v4'
WHERE base_url IS NULL;
```

**Updated Interface:**

```typescript
export interface AdminKeySummary {
  id: number;
  providerId: string;
  label: string;
  weight: number;
  enabled: boolean;
  activeVersion: number | null;
  accountId: string | null;
  baseUrl: string | null; // NEW
  modelId: string | null; // NEW
}

export interface AddKeyInput {
  providerId: string;
  label: string;
  apiToken: string;
  accountId?: string;
  weight?: number;
  enabled?: boolean;
  baseUrl?: string; // NEW
  modelId?: string; // NEW
}
```

### 2. New Admin Endpoints

**A. Fetch Models**

```
POST /api/admin/keys/discover-models
Headers: X-Admin-Key
Body: {
  baseUrl: string;
  accountId: string;
  token: string;
}
Response: {
  models: Array<{
    id: string;
    name: string;
    description?: string;
  }>;
}
```

**Implementation:**

- Makes authenticated request to `{baseUrl}/accounts/{accountId}/ai/models`
- Handles both Cloudflare and OpenAI-compatible list formats
- Returns normalized model list
- Times out after 10s
- Returns error details on failure

**B. Test Connection**

```
POST /api/admin/keys/test-connection
Headers: X-Admin-Key
Body: {
  baseUrl: string;
  accountId: string;
  token: string;
  modelId: string;
}
Response: {
  success: boolean;
  latencyMs?: number;
  error?: string;
}
```

**Implementation:**

- Makes test inference call: `{baseUrl}/accounts/{accountId}/ai/run/{modelId}`
- Uses minimal test prompt: `{ prompt: "test" }`
- Measures round-trip latency
- Returns success + latency, or error message
- Times out after 30s

### 3. Update Existing Endpoints

**Add/Edit Key Endpoints:**

- Accept `baseUrl` and `modelId` in request body
- Validate base URL format (must be HTTPS)
- Store in database
- Return in response

**Health Endpoint:**

- Include `baseUrl` and `modelId` in `AdminKeySummary`

---

## Frontend Changes Required

### 1. Sheet Form Updates

**Add Three New Fields:**

1. **Base URL Input**
   - Text input, placeholder: `https://api.cloudflare.com/client/v4`
   - Validation: Must be HTTPS URL
   - Default: Cloudflare endpoint

2. **Model Selection**
   - Dropdown (initially disabled/empty)
   - "Fetch Models" button next to dropdown
   - Loading state while fetching
   - Error state if fetch fails

3. **Test Connection Button**
   - Secondary button style
   - Disabled until: baseUrl + accountId + token + modelId filled
   - Shows loading spinner while testing
   - Shows success/failure badge after test

### 2. React Components (After Migration)

**New Components:**

```tsx
<BaseUrlField
  value={baseUrl}
  onChange={setBaseUrl}
  error={baseUrlError}
/>

<ModelSelector
  baseUrl={baseUrl}
  accountId={accountId}
  token={token}
  selectedModel={modelId}
  onModelChange={setModelId}
  onFetchModels={handleFetchModels}
  loading={fetchingModels}
  error={fetchModelsError}
/>

<ConnectionTest
  baseUrl={baseUrl}
  accountId={accountId}
  token={token}
  modelId={modelId}
  onTest={handleTestConnection}
  result={testResult}
  loading={testingConnection}
/>
```

### 3. State Management (TanStack Query)

**Queries:**

```typescript
// Fetch available models
const {
  data: models,
  isLoading,
  mutate,
} = useMutation({
  mutationFn: ({ baseUrl, accountId, token }) =>
    api.post("/api/admin/keys/discover-models", { baseUrl, accountId, token }),
});

// Test connection
const { data: testResult, mutate: testConnection } = useMutation({
  mutationFn: ({ baseUrl, accountId, token, modelId }) =>
    api.post("/api/admin/keys/test-connection", {
      baseUrl,
      accountId,
      token,
      modelId,
    }),
});
```

---

## Design Decisions

### 1. Base URL Defaults

- **Default:** Cloudflare Workers AI endpoint
- **Rationale:** Existing workflows continue to work without configuration
- **Migration:** Backfill existing keys with default

### 2. Model Discovery Method

- **Choice:** `/v1/models` endpoint query
- **Rationale:** OpenAI-compatible API standard
- **Fallback:** If endpoint doesn't exist, allow manual model ID entry

### 3. Test Connection Safety

- **Minimal test:** Single inference call with tiny prompt
- **Timeout:** 30s max
- **Cost:** ~$0.0001 per test (negligible)
- **Frequency limit:** Client-side debounce (1 test per 5s)

### 4. When to Test

- **Optional:** Operator can save without testing
- **Encouraged:** UI prompts "Test before saving?"
- **Validation:** Backend validates token format but doesn't test connectivity

### 5. Base URL Validation

- **Client-side:** Must be valid HTTPS URL
- **Server-side:** Must match `https://*` pattern
- **No allowlist:** Trust operators to configure correctly

---

## Security Considerations

### 1. Credentials in Transit

- ✅ Test/fetch endpoints require management key (`X-Admin-Key`)
- ✅ Token passed in request body (not URL)
- ✅ HTTPS required for base URLs
- ⚠️ Backend makes outbound requests with operator-provided credentials

### 2. SSRF Protection

- Base URL must be HTTPS
- Timeout enforced (10s/30s)
- No private IP ranges (future enhancement)
- Rate limiting on test endpoint (future enhancement)

### 3. Token Exposure

- Test/fetch endpoints are admin-only
- Token never logged
- Test results don't include token material

---

## Error Handling

### Fetch Models Failures

```
❌ Network Error: Could not reach https://custom-endpoint.com
❌ Authentication Failed: Invalid API token
❌ Timeout: Endpoint took longer than 10s to respond
❌ Invalid Response: Expected model list, got error
```

### Test Connection Failures

```
❌ Connection Failed: Could not reach base URL
❌ Authentication Failed: 401 Unauthorized
❌ Model Not Found: 404 - Model ID not available
❌ Rate Limited: 429 Too Many Requests
❌ Timeout: Test took longer than 30s
```

---

## Implementation Phases

### Phase 1: Backend Foundation

- [ ] Database migration (add columns)
- [ ] Update `AdminKeySummary` interface
- [ ] Update add/edit key endpoints to accept baseUrl + modelId
- [ ] Update health endpoint to return new fields

### Phase 2: Model Discovery

- [ ] Implement `/api/admin/keys/discover-models` endpoint
- [ ] Handle Cloudflare and OpenAI-compatible responses
- [ ] Add error handling and timeout

### Phase 3: Connection Testing

- [ ] Implement `/api/admin/keys/test-connection` endpoint
- [ ] Measure latency
- [ ] Return normalized success/failure

### Phase 4: Frontend (React)

- [ ] Add base URL field to key form
- [ ] Add model selector with fetch button
- [ ] Add connection test button
- [ ] Show loading and error states
- [ ] Update save logic to include new fields

### Phase 5: Testing & Polish

- [ ] Unit tests for backend endpoints
- [ ] Integration tests for model discovery
- [ ] E2E tests for full workflow
- [ ] Error message polish
- [ ] Loading state animations

---

## Out of Scope

- Custom authentication schemes (OAuth, mTLS)
- Provider-specific model filters
- Model capability detection (vision, function calling)
- Cost estimation per model
- Automatic model rotation based on availability
- Batch testing multiple models at once
- Historical test results tracking

---

## Future Enhancements

1. **SSRF Protection:** Block private IP ranges
2. **Rate Limiting:** Limit test calls per key per minute
3. **Model Metadata:** Cache model descriptions, pricing
4. **Provider Presets:** Quick-select for common providers
5. **Connection History:** Show last successful test time
6. **Auto-rotate:** Switch to backup model if primary fails

---

## Acceptance Criteria

### Backend

- [ ] Base URL and model ID stored in database
- [ ] Fetch models endpoint returns normalized model list
- [ ] Test connection endpoint validates credentials + model
- [ ] Existing keys default to Cloudflare endpoint
- [ ] All endpoints require management key auth

### Frontend

- [ ] Base URL field with HTTPS validation
- [ ] "Fetch Models" button populates dropdown
- [ ] Model dropdown shows available models
- [ ] "Test Connection" button shows success/failure
- [ ] Loading states during fetch/test
- [ ] Error messages for all failure modes
- [ ] Save includes baseUrl + modelId

### UX

- [ ] Operator can save without testing (optional)
- [ ] Test shows latency on success
- [ ] Clear error messages on failure
- [ ] Form validates before allowing test
- [ ] Existing keys continue to work (backfilled defaults)

---

## Next Steps (When Ready to Implement)

1. **Run `/to-spec`** in new session with this document as input
2. **Run `/to-tickets`** to generate implementation tickets with blocking edges
3. **Run `/implement`** per ticket (or `/implement-spec` for orchestrated build)
4. **Run `/code-review`** on final diff
5. **Run `/retro`** to capture learnings

---

**END OF SEED DOCUMENT**

This document is ready to be fed into `/to-spec` when you're ready to build this feature.
