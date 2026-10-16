# ADR-001: Use Database-Only Credential Management

## Status

Accepted

## Date

2025-01-16

## Context

The application currently has three sources for Cloudflare Workers AI credentials, creating a fallback hierarchy:

1. **Database (primary)** - Credentials managed through the admin UI, stored in D1
2. **AI_ACCOUNTS environment variable (secondary)** - JSON array of account credentials
3. **Environment variable fallback (tertiary)** - `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`

This was implemented in `src/services/pool-source.ts` with the intent to provide flexibility during initial setup and deployment. However, this multi-source approach creates several problems:

### Current Issues

**Confusing Error Messages**

- Users see "fallback deploy credential" errors when database is empty
- Unclear which credential source is actually being used
- "No servable credential" vs "404 from fallback" are different failure modes

**No Single Source of Truth**

- Admin dashboard shows database keys, but fallback may be active
- Users configure keys in UI, but environment variables override behavior
- Cannot verify "what's actually running" from the UI alone

**Security & Audit Gaps**

- Environment variables in `.dev.vars` may be committed to git
- No audit trail when using env var credentials
- Cannot rotate credentials without redeployment
- No visibility into which account is being used

**Poor UX**

- Admin dashboard implies it's authoritative, but it's not
- Users add keys through UI, but fallback still gets 404 errors
- Warning logic becomes complex: "Are we using database keys or fallback?"

### Requirements

- Credentials must be manageable through the admin UI
- Credential changes must not require redeployment
- Security audit trail (who changed what, when)
- Clear error messages when no credentials exist
- Credentials should be rotatable without downtime

## Decision

**Remove all credential fallback mechanisms.** Make the D1 database the single authoritative source for credentials.

The credential flow becomes:

```
Database (D1) → Admin UI → Provider Pool
```

Specifically:

- Remove `AI_ACCOUNTS` environment variable support
- Remove `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` fallback
- Simplify `pool-source.ts` to read from database only
- Return empty pool when database has no keys (clear error path)

## Alternatives Considered

### Keep Fallback for Bootstrap Only

**Approach:** Allow environment variables only when database is empty, then disable them forever once first key is added.

**Pros:**

- Easier initial deployment (no UI step required)
- Backwards compatible with existing deployment scripts

**Cons:**

- Adds complexity (conditional fallback logic)
- Still creates confusion: "Did it bootstrap or not?"
- Users might rely on this instead of using the admin UI
- Introduces state dependency: "has database been initialized?"

**Rejected:** The added complexity doesn't justify the small convenience gain. Fresh deployments should follow a clear setup path: deploy → access admin UI → add credentials.

### Keep AI_ACCOUNTS Environment Variable

**Approach:** Remove only the fallback, keep `AI_ACCOUNTS` JSON variable as an alternative to database.

**Pros:**

- Allows GitOps-style credential management for some users
- Can configure multiple accounts via environment in one shot

**Cons:**

- Still creates "which source is authoritative?" confusion
- No audit trail for changes
- Credentials in environment are harder to rotate
- Admin UI cannot show or manage these credentials
- Two parallel systems to maintain and document

**Rejected:** Having two systems defeats the purpose. If database is the source of truth, it should be the _only_ source.

### Make Environment Variables Override Database

**Approach:** If environment variables are set, they take precedence over database.

**Pros:**

- Allows CI/test environments to override credentials easily
- Deployment-time credential injection without DB access

**Cons:**

- Makes admin UI misleading (shows DB keys, but env vars are active)
- Cannot tell from the UI what's actually running
- Security: environment override could silently change behavior
- Defeats audit trail completely

**Rejected:** This inverts the authority relationship. The UI should be authoritative, not overridable.

## Consequences

### Positive

- **Single source of truth:** Database is authoritative, UI is accurate
- **Clear errors:** "No credentials configured" is unambiguous
- **Security:** Full audit trail, credentials rotatable via UI
- **Simpler code:** Remove fallback logic from `pool-source.ts`
- **Better testing:** No environment variable dependencies in tests
- **Predictable behavior:** What you see in admin UI is what's running

### Negative

- **Breaking change:** Deployments relying on env vars will break
- **Migration required:** Must add credentials through UI after upgrade
- **Manual setup step:** Fresh deployments require admin UI access to add first key

### Migration Path

For existing deployments using environment variables:

1. **Before upgrade:**
   - Document current `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` values
   - Access admin UI and verify database state

2. **After upgrade:**
   - If generation stops working, access admin UI at `/#admin`
   - Click "+ New key" and add the documented credentials
   - Test generation to confirm

3. **Update deployment configs:**
   - Remove `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` from wrangler.toml / secrets
   - Update deployment documentation to reference admin UI setup

### Documentation Updates Required

- `docs/DEPLOY.md` - Update to require admin UI credential setup
- `docs/CREDENTIALS_SETUP.md` - Remove references to environment variables
- `README.md` - Update quick start to mention admin UI requirement
- `docs/API.md` - Update provider pool section

### Code Changes Required

- `src/services/pool-source.ts` - Remove fallback logic, database-only
- `src/services/pool-source.test.ts` - Remove fallback tests, update scenarios
- `workers/src/endpoints/frontend.ts` - Warning logic already correct (checks DB)
- `workers/wrangler.toml` - Remove credential env var references from examples

### Risk Mitigation

**Risk:** Users upgrade and lose service because credentials were in env vars

**Mitigation:**

- Add prominent warning in release notes
- Include migration instructions in CHANGELOG
- Add startup health check that logs "0 credentials configured" warning
- Keep admin UI easily accessible (no forced authentication on first run)

**Risk:** Fresh deployment has no path to add first credential

**Mitigation:**

- Admin UI remains accessible without credentials (for setup)
- Management key (`API_KEYS` env var) is separate from provider credentials
- Documentation clearly states: deploy → access UI → add key → test

## Verification

After implementation:

- [ ] `pool-source.ts` reads only from database
- [ ] Environment variables `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `AI_ACCOUNTS` have no effect
- [ ] When database is empty, generation returns "no servable credential"
- [ ] Warning banner appears on generator page when DB has 0 keys
- [ ] Admin UI successfully adds keys that immediately work
- [ ] All tests pass without environment variable dependencies
- [ ] Documentation updated (DEPLOY.md, CREDENTIALS_SETUP.md, README.md)
- [ ] Release notes include migration instructions

## References

- Related code: `src/services/pool-source.ts`
- User feedback: "can we deprecate that fallback mechanism... and make the current admin dashboard approach... the only one (only source of truth)"
- Original implementation: Multi-source fallback for deployment flexibility
