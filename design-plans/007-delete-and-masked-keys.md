# Delete Button and Masked Key Preview

**Status:** To-Spec (Backend work required)  
**Priority:** Medium  
**Blocked by:** React migration (Issue #96) - implement after frontend rewrite  
**Related:** design-plans/006-admin-view-improvements.md

## Problem Statement

Operators need:

1. **Permanent key deletion** - Hard delete keys from database (currently only soft-delete/disable exists)
2. **Key identification** - Visual confirmation of which API token is associated with each row

Current limitations:

- Disable button only sets `enabled=0`, keeps row for audit
- No way to permanently remove keys from database
- Account ID alone is insufficient to identify which token was used
- Token material never returned by API (security by design)

## User Stories

1. As an operator, I want to permanently delete a provider key from the database, so that compromised or obsolete credentials are completely removed.
2. As an operator, I want to see a masked preview of each API token (e.g., `sk-ab****xyz`), so that I can visually confirm which key is which without exposing the full credential.
3. As an operator, I want the system to confirm deletion with a strong warning, so that I understand this action is permanent and cannot be undone.
4. As a security-conscious operator, I want token previews to show only the first 4 and last 4 characters, so that minimal token material is ever displayed.

## Solution

### Feature 1: Hard Delete with DELETE Endpoint

**Backend Changes Required:**

1. **New API Endpoint**

   ```
   DELETE /api/admin/keys/:id
   ```
   - Requires management key authentication
   - Permanently removes row from `provider_keys` table
   - Cascades to `credential_versions` (via foreign key)
   - Records deletion in `admin_audit` table
   - Returns 200 with `{ id, deleted: true }` on success
   - Returns 404 if key not found
   - Returns 409 if key has active sessions (optional safety check)

2. **Database Cascade**
   - Verify `credential_versions` has `ON DELETE CASCADE` for `provider_key_id`
   - Audit log records deletion with timestamp, actor, key label

3. **Service Layer**
   ```typescript
   export async function deleteProviderKey(
     db: AdminD1,
     keyId: number
   ): Promise<{ id: number; deleted: true }> {
     const key = await keyRow(db, keyId);
     if (!key) throw new AdminStoreError(404, `unknown provider key ${keyId}`);

     await db.commit([
       write("DELETE FROM provider_keys WHERE id = ?", keyId),
       bumpWrite(),
       auditWrite("delete", key.provider_id, keyId, key.label),
     ]);

     return { id: keyId, deleted: true };
   }
   ```

**Frontend Changes:**

1. **UI: Two Buttons**
   - **Disable button** (ban icon `fa-ban`): Soft delete, reversible, keeps audit trail
   - **Delete button** (trash icon `fa-trash`): Hard delete, permanent, shows strong warning

2. **Delete Confirmation**

   ```
   ⚠️ Permanently Delete Key #42?

   This will remove:
   - Account: eb998e8d...
   - All credential versions
   - All audit history

   This action CANNOT be undone.

   Type "DELETE" to confirm: [_______]

   [Cancel] [Delete Permanently]
   ```

3. **Delete Handler**
   ```javascript
   async function deleteKeyPermanently(keyId) {
     const generation = adminRequestGeneration;
     try {
       const res = await api("DELETE", ADMIN_KEYS + "/" + keyId);
       if (res.stale) return;
       if (!res.ok) {
         showError(errorLine, "Delete failed: " + errorMessage(res));
         return;
       }
       showNotice("Key #" + keyId + " permanently deleted");
       await loadHealth();
     } catch (error) {
       if (generation === adminRequestGeneration) {
         showError(
           errorLine,
           error instanceof Error ? error.message : String(error)
         );
       }
     }
   }
   ```

---

### Feature 2: Masked Key Preview Column

**Backend Changes Required:**

1. **Database Migration**

   ```sql
   -- Migration 0004_token_prefix.sql
   ALTER TABLE provider_keys ADD COLUMN token_prefix TEXT;

   -- Backfill existing keys with placeholder (they have no prefix stored)
   UPDATE provider_keys SET token_prefix = '****' WHERE token_prefix IS NULL;
   ```

2. **Capture Prefix During Add/Rotate**
   - When sealing token, extract first 8 characters
   - Store in `token_prefix` column (plaintext, non-sensitive)
   - Never store more than 8 chars
   - Never store middle or full token

   ```typescript
   export async function addProviderKey(
     db: AdminD1,
     seal: (token: string) => Promise<string>,
     input: AddKeyInput
   ): Promise<{
     id: number;
     label: string;
     providerId: string;
     activeVersion: number;
   }> {
     const token = clean(input.apiToken);
     assertTokenLength(token);

     // NEW: Extract prefix (first 8 chars only)
     const tokenPrefix = token.substring(0, 8);

     const envelope = await seal(token);

     await db.commit([
       write(
         "INSERT INTO provider_keys (provider_id, label, external_account_id, weight, enabled, token_prefix) " +
           "VALUES (?, ?, ?, ?, ?, ?)",
         providerId,
         label,
         accountId || null,
         weight,
         enabled ? 1 : 0,
         tokenPrefix
       ),
       // ... rest of commit
     ]);
   }
   ```

3. **Update AdminKeySummary Interface**

   ```typescript
   export interface AdminKeySummary {
     id: number;
     providerId: string;
     label: string;
     weight: number;
     enabled: boolean;
     activeVersion: number | null;
     accountId: string | null;
     tokenPrefix: string | null; // NEW: "sk-abc123" or "****" for legacy keys
   }
   ```

4. **Update Health Query**
   ```sql
   SELECT k.id AS id,
          k.provider_id AS providerId,
          k.label AS label,
          k.weight AS weight,
          k.enabled AS enabled,
          k.external_account_id AS accountId,
          k.token_prefix AS tokenPrefix,  -- NEW
          MAX(v.version) AS activeVersion
     FROM provider_keys k
     LEFT JOIN credential_versions v
       ON v.provider_key_id = k.id AND v.revoked_at IS NULL
    GROUP BY k.id
   ```

**Frontend Changes:**

1. **Add "Key" Column to Table**

   ```html
   <thead>
     <tr>
       <th>Key</th>
       <!-- NEW -->
       <th>Account ID</th>
       <th>Actions</th>
     </tr>
   </thead>
   ```

2. **Render Masked Preview**

   ```javascript
   function maskToken(prefix) {
     if (!prefix || prefix === "****") return "••••••••";
     // Show first 4 + asterisks + last 4
     // e.g., "sk-abc123def456" → "sk-a****456"
     if (prefix.length >= 8) {
       return (
         prefix.substring(0, 4) + "****" + prefix.substring(prefix.length - 4)
       );
     }
     return prefix + "****";
   }

   const keyCell = document.createElement("td");
   keyCell.className = "p-3 font-mono text-sm opacity-70";
   keyCell.textContent = maskToken(k.tokenPrefix);
   ```

3. **Table Layout**
   ```
   Key            | Account ID                        | Actions
   ---------------|-----------------------------------|------------------
   sk-a****456    | eb998e8d... v1                   | [toggle] [edit]
   cf-b****789    | c4d8e9f0... v2                   | [toggle] [edit]
   ****           | (no account)                      | [toggle] [edit]
   ```

---

## Implementation Priority

### Phase 1: Hard Delete (Higher Priority)

- Operators need to remove compromised/test keys
- Simpler implementation (no schema change for existing keys)
- Can be done without masked preview

### Phase 2: Masked Key Preview (Lower Priority)

- Nice-to-have for UX
- Requires migration + backfill strategy for existing keys
- Account ID already provides some identification

---

## Security Considerations

### Delete Endpoint

- ✅ Requires management key (X-Admin-Key header)
- ✅ Audit log records deletion
- ✅ Cannot be undone (by design)
- ⚠️ Consider adding "last used" timestamp check to prevent accidental deletion of active keys

### Token Prefix

- ✅ Only first 8 characters stored (tokens are 32+ chars random)
- ✅ Insufficient for token reconstruction
- ✅ Plaintext storage acceptable (not credential material)
- ⚠️ Never show in client-side errors or logs

---

## Testing Requirements

### DELETE Endpoint

- Unit tests for service layer (`deleteProviderKey`)
- Integration tests for DELETE route
- Test cascade deletion of credential_versions
- Test audit log entry creation
- Test 404 when key doesn't exist

### Masked Preview

- Unit test for prefix extraction during add
- Unit test for prefix update during rotate
- Integration test for health endpoint returning prefix
- UI test for masked rendering (e.g., `sk-a****456`)
- Test fallback rendering for legacy keys (`tokenPrefix = null`)

---

## Out of Scope

- Bulk delete operations
- Soft-delete recovery/undelete feature
- Full token history/version display
- "Last used" timestamp tracking (defer to separate feature)
- Token strength validation (complexity requirements)

---

## Migration Path

1. **Current PR:** Remove delete button, document in this spec
2. **Backend PR:** Add DELETE endpoint + token_prefix column
3. **React Migration (Issue #96):** Implement both features in React UI
4. **Verification:** Manual testing + Playwright e2e tests

---

## Design Mockup (Table with Both Features)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Cloudflare Workers AI                                          [+ New key]  │
├────────────────┬──────────────────────────────────┬───────────────────────────┤
│ Key            │ Account ID                       │ Actions                   │
├────────────────┼──────────────────────────────────┼───────────────────────────┤
│ sk-a****3f v2  │ eb998e8d848b5c7182ad39c49a53e37f │ [🟢] [✏️] [🚫] [🗑️]      │
│ cf-1****9b v1  │ c4d8e9f0123456789abcdef012345678 │ [🟢] [✏️] [🚫] [🗑️]      │
│ ****           │ (none)                            │ [⚫] [✏️] [🚫] [🗑️]      │
└────────────────┴──────────────────────────────────┴───────────────────────────┘

Legend:
  🟢 = Enabled toggle
  ⚫ = Disabled (grayed out)
  ✏️ = Edit button
  🚫 = Disable button (soft delete, reversible)
  🗑️ = Delete button (hard delete, permanent) ← NEW
```

---

## References

- Original request: User feedback on admin-workbench UI
- Related: design-plans/006-admin-view-improvements.md (label column removal)
- Blocked by: Issue #96 (React migration)
- Backend service: `workers/src/services/admin-store.ts`
- Frontend: `workers/src/endpoints/frontend.ts`

---

## Acceptance Criteria

### DELETE Endpoint

- [ ] `DELETE /api/admin/keys/:id` endpoint implemented
- [ ] Cascades to credential_versions
- [ ] Creates audit log entry
- [ ] Returns 404 for unknown key
- [ ] Frontend shows confirmation dialog with "DELETE" typing requirement
- [ ] Success notification after deletion
- [ ] Key disappears from table immediately

### Masked Preview

- [ ] `token_prefix` column added to schema
- [ ] Prefix captured during add/rotate operations
- [ ] AdminKeySummary includes tokenPrefix field
- [ ] Health endpoint returns prefix
- [ ] Frontend renders masked preview (e.g., `sk-a****3f`)
- [ ] Legacy keys show `****` placeholder
- [ ] Monospace font for key column

---

**END OF SPEC**
