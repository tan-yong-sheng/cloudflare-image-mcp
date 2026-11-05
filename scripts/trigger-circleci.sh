#!/usr/bin/env bash

# Trigger a CircleCI pipeline run manually.
# Usage: ./scripts/trigger-circleci.sh [branch] [--param KEY=VALUE ...]
#
# Note: this project's CircleCI integration uses CircleCI-native VCS, so the
# path-filtering orb cannot read the diff and would leave every workflow off.
# The default here therefore sets force_run_all=true, which gates the
# pr-checks workflow independently of path filtering.

set -euo pipefail

PROJECT_SLUG="circleci/EpKr3yPPwk6x8UkpiKhG9m/TdAVxSgrvkHaBdVN5J7mmB"
DEFINITION_ID="7d06d2ae-4156-4d13-a794-57b43cbfc777"

BRANCH="${1:-$(git branch --show-current)}"
shift 2>/dev/null || true

ARGS=(--project "$PROJECT_SLUG" --definition-id "$DEFINITION_ID" --branch "$BRANCH")

# Since this project uses CircleCI-native VCS, path-filtering cannot read the diff.
# Bypass it by directly passing the parameters that pr-checks needs.
ARGS+=(--param "run_ci=true")
ARGS+=(--param "run_workers=true")
ARGS+=(--param "run_client=true")

while [[ $# -gt 0 ]]; do
  case "$1" in
    --param) ARGS+=(--param "$2"); shift 2 ;;
    --param=*) ARGS+=(--param "${1#--param=}"); shift ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

echo "Triggering CircleCI pipeline for branch: $BRANCH"
echo "Project: $PROJECT_SLUG"
echo "Pipeline definition: $DEFINITION_ID"
echo ""

circleci pipeline run "${ARGS[@]}" --json