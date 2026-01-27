**`gh` + GitHub Actions** is a power combo once you know the commands. You can basically replace 80% of the web UI with your terminal.

Here’s a **practical, end-to-end guide** to inspecting workflow runs with **GitHub CLI**.

---

# 0️⃣ Prerequisites

### Install GitHub CLI

```bash
gh --version
```

If not installed:

* macOS: `brew install gh`
* Ubuntu/Debian: `sudo apt install gh`
* Windows: `winget install GitHub.cli`

### Authenticate

```bash
gh auth login
```

Make sure the account has access to the repo.

---

# 1️⃣ List Workflow Runs

This is the entry point.

```bash
gh run list
```

**Output shows:**

* Run ID
* Workflow name
* Branch
* Event (push, pull_request, etc.)
* Status (completed, in_progress)
* Conclusion (success, failure, cancelled)

### Useful filters

```bash
# Only failed runs
gh run list --status failure

# Only runs from a branch
gh run list --branch main

# Limit results
gh run list --limit 5

# Specific workflow
gh run list --workflow "CI"
```

---

# 2️⃣ View Details of a Specific Run

You need the **Run ID** from `gh run list`.

```bash
gh run view <run-id>
```

Example:

```bash
gh run view 8217465123
```

Shows:

* Workflow name
* Commit SHA
* Trigger event
* Jobs in the run
* Status per job

---

# 3️⃣ See Jobs Inside a Run

```bash
gh run view <run-id> --json jobs | jq
```

Or cleaner summary:

```bash
gh run view <run-id> --log-failed
```

This prints **only logs from failed jobs** — super useful for CI debugging.

---

# 4️⃣ View Logs (FULL logs)

```bash
gh run view <run-id> --log
```

This streams all logs for all jobs.

### Only a specific job

First list jobs:

```bash
gh run view <run-id>
```

Then:

```bash
gh run view <run-id> --job <job-id> --log
```

---

# 5️⃣ Watch a Run Live (like tail -f)

If a workflow is still running:

```bash
gh run watch <run-id>
```

This auto-refreshes status until it finishes.

---

# 6️⃣ Download Logs as Files

```bash
gh run download <run-id>
```

This creates a folder with logs per job/step.

Useful for:

* Archiving
* Parsing
* Sharing logs

---

# 7️⃣ Rerun a Workflow

```bash
gh run rerun <run-id>
```

Only rerun failed jobs:

```bash
gh run rerun <run-id> --failed
```

---

# 8️⃣ Cancel a Running Workflow

```bash
gh run cancel <run-id>
```

---

# 9️⃣ Inspect Workflow Definitions

List workflows in repo:

```bash
gh workflow list
```

View a workflow file:

```bash
gh workflow view "CI"
```

Run a workflow manually:

```bash
gh workflow run "CI" --ref main
```

---

# 🔟 Get Raw JSON (for scripting / automation)

This is where things get powerful (and very “you” if you like automation).

```bash
gh run view <run-id> --json \
  name,status,conclusion,event,headBranch,headSha,jobs
```

Example parsing:

```bash
gh run view <run-id> --json conclusion -q .conclusion
```

Use in scripts:

```bash
if [[ $(gh run view $ID --json conclusion -q .conclusion) != "success" ]]; then
  echo "Run failed"
fi
```

---

# 🧠 Most Useful Debug Combo

When CI fails, this is the golden sequence:

```bash
gh run list --limit 5
gh run view <run-id>
gh run view <run-id> --log-failed
```

You usually don’t even need the browser.

---

# ⚡ Pro Tips

### 1. Work in another repo without cd

```bash
gh run list -R owner/repo
```

### 2. Get latest run ID automatically

```bash
RUN_ID=$(gh run list --limit 1 --json databaseId -q '.[0].databaseId')
gh run view $RUN_ID --log-failed
```

### 3. Combine with `fzf` (elite workflow)

```bash
gh run list | fzf | awk '{print $1}' | xargs gh run view --log-failed
```

---

# 📌 Command Cheat Sheet

| Task             | Command                  |
| ---------------- | ------------------------ |
| List runs        | `gh run list`            |
| View run         | `gh run view <id>`       |
| View logs        | `gh run view <id> --log` |
| Failed logs only | `--log-failed`           |
| Watch live       | `gh run watch <id>`      |
| Download logs    | `gh run download <id>`   |
| Rerun            | `gh run rerun <id>`      |
| Cancel           | `gh run cancel <id>`     |
| List workflows   | `gh workflow list`       |

---

If you want, next I can show how to **build a script that auto-notifies (ntfy / webhook / etc.) when a workflow fails** — that pairs *really* nicely with your automation setups.
