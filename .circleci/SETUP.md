# CircleCI Setup Instructions

This repo now uses CircleCI with **dynamic config + path filtering** (Option C hybrid).

## Architecture

- **`.circleci/setup.yml`** - Entry point that detects which files changed using `circleci/path-filtering` orb
- **`.circleci/continue.yml`** - Actual jobs that run conditionally based on pipeline parameters

## Web UI Configuration Required (Automated Option Available)

You must configure triggers in CircleCI. The path filtering orb alone cannot detect PR events; GitHub App triggers are needed.

### Option A: Automated Setup (Recommended)

Run the provided script to automate trigger setup:

```bash
node scripts/setup-circleci-triggers.mjs
```

This script:

1. Waits for CircleCI to auto-discover pipeline definitions from `setup.yml`
2. Gets the pipeline definition ID
3. Gets the GitHub repo ID
4. Creates three triggers:
   - `only-open-prs` → `pr-checks` workflow
   - `only-ready-for-review-prs` → `e2e-full` workflow
   - `only-merged-prs` → `tag-release` workflow

### Option B: Manual Web UI Setup

If you prefer manual configuration, follow these steps:

#### Step 1: Ensure GitHub App Integration

1. Go to [CircleCI Organization Settings](https://app.circleci.com/settings/organization)
2. Check your Organization slug format:
   - `circleci/<UID>` = GitHub App integration ✅
   - `github/<org>` or `gh/<org>` = OAuth integration (no PR triggers)

If you see `github/` or `gh/`, you need to migrate to GitHub App integration.

### Step 2: Configure Project Triggers

Go to **Project Settings > Triggers** and create three triggers:

#### Trigger 1: Fast PR Checks (for `pr-checks` workflow)

- **Pipeline:** `setup.yml` (auto-detected)
- **Trigger type:** GitHub App
- **Run on:** `PR opened or pushed to`
- **Branches:** `main` (only PRs targeting main)

#### Trigger 2: Full E2E Pipeline (for `e2e-full` workflow)

- **Pipeline:** `setup.yml`
- **Trigger type:** GitHub App
- **Run on:** `PR marked ready for review`
- **Branches:** `main`

This means expensive E2E tests only run when you explicitly mark a PR as ready for review.

#### Trigger 3: Release Pipeline (for `tag-release` workflow)

- **Pipeline:** `setup.yml`
- **Trigger type:** GitHub App
- **Run on:** `PR merged`
- **Branches:** `main`

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

- GitHub Actions workflows (`.github/workflows/`) remain until CircleCI is proven
- Once CircleCI is stable, you can remove `.github/workflows/pr-checks.yml`, `tag-release.yml`, and `e2e-tests.yml`
- Keep `.github/workflows/deploy-workers.yml` separately (excluded from this migration)
