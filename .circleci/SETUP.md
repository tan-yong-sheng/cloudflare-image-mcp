# CircleCI Setup Instructions

This repo now uses CircleCI with **dynamic config + path filtering** (Option C hybrid).

## Architecture

- **`.circleci/setup.yml`** - Entry point that detects which files changed using `circleci/path-filtering` orb
- **`.circleci/continue.yml`** - Actual jobs that run conditionally based on pipeline parameters

## Manual CLI Triggering (Current Setup)

This project uses CircleCI-native VCS integration, which doesn't support automatic GitHub webhook triggers. Use the provided script to trigger pipelines manually:

```bash
# Trigger for current branch
./scripts/trigger-circleci.sh

# Trigger for specific branch
./scripts/trigger-circleci.sh ci/add-circleci
```

This script:

- Uses the CircleCI CLI to trigger the pipeline definition
- Passes the branch name to CircleCI
- Bypasses the path-filtering orb by passing pipeline parameters directly
  (`run_ci=true`, `run_workers=true`, `run_client=true`)
  (the path-filtering orb cannot read the diff on CircleCI-native VCS projects, so
  a manual run would otherwise finish with no workflows)

Extra parameters can be appended as `--param key=value`.

**Note:** Since the project uses CircleCI-native VCS, automatic PR triggers are not available. You must manually trigger pipelines after pushing changes.

## Alternative: GitHub App Integration (For Automatic Triggers)

If you want automatic PR triggers, the CircleCI project must be recreated with GitHub App integration:

1. Delete the current CircleCI project in the web UI
2. Re-add the repository, choosing "GitHub App" integration
3. Run `node scripts/setup-circleci-triggers.mjs` to configure triggers
4. The `setup-circleci-triggers.mjs` script will fail with CircleCI-native VCS and guide you to this step

### Step 3: Configure Contexts

Go to **Organization Settings > Contexts** and ensure:

- **Context name:** `github-release`
- **Environment variable:** `GH_TOKEN` (GitHub personal access token with `repo` scope)

This context is referenced in `continue.yml` for the `tag-and-release` job.

### Step 4: Configure Project Environment Variables

Go to **Project Settings > Environment Variables** and set:

- `CLOUDFLARE_API_TOKEN` - Cloudflare API token
- `CLOUDFLARE_ACCOUNT_ID` - Cloudflare account ID
- `D1_DATABASE_ID_STAGING` - D1 database ID for staging
- `API_KEY` - Optional: single API key
- `API_KEYS` - Optional: comma-separated API keys
- `ADMIN_API_KEY` - Admin API key for E2E tests

## Pipeline Behavior

### Fast PR Checks (`pr-checks`)

- **Trigger:** PR opened or pushed to main
- **Always runs:** Yes (bypasses path filtering for gate consistency)
- **Jobs:** `fast` (typecheck, lint, unit tests, build, version consistency)
- **Duration:** ~3 minutes

### Full E2E Pipeline (`e2e-full`)

- **Trigger:** PR marked ready for review OR manual dispatch
- **Path filtering:** Only runs if `workers/`, `client/`, or `e2e/` changed
- **Jobs:** `deploy_staging` → `e2e-tests` → `cleanup-staging` → `e2e-gate-sentinel`
- **Duration:** ~10-15 minutes
- **Behavior:** Expensive tests run later in PR lifecycle to save cost

### Release Pipeline (`tag-release`)

- **Trigger:** PR merged to main
- **Path filtering:** Only runs if `workers/package.json` changed
- **Jobs:** `tag-and-release` (semver check, tag push, GitHub release)
- **Duration:** ~1 minute

### Scheduled E2E (`e2e-scheduled`)

- **Trigger:** Daily cron at midnight UTC
- **Path filtering:** Bypassed (always runs on schedule)
- **Branch:** `main` only
- **Purpose:** Canary tier for catching regressions

## Why This Is Better Than GitHub Actions

1. **Path-based filtering** - Skip expensive E2E tests for docs-only changes
2. **Staged E2E** - Run fast checks on every PR, expensive tests only when ready for review
3. **Idempotent release** - Tag/release only when version actually changed
4. **Cost optimization** - E2E tests run less frequently without sacrificing coverage

## Migration Notes

- GitHub Actions workflows replaced by CircleCI have been deleted:
  - `.github/workflows/pr-checks.yml` → CircleCI `pr-checks` workflow
  - `.github/workflows/tag-release.yml` → CircleCI `tag-release` workflow
  - `.github/workflows/e2e-tests.yml` → CircleCI `e2e-full` workflow
- `.github/workflows/deploy-workers.yml` remains for deployment (excluded from this migration - handles actual deployment to Workers)
- **Dynamic config used:** `.circleci/setup.yml` (entry with path-filtering) → `.circleci/continue.yml` (actual jobs)
- **Manual trigger required:** Project uses CircleCI-native VCS; use `./scripts/trigger-circleci.sh`
