#!/usr/bin/env bash

# Trigger CircleCI pipeline manually
# Usage: ./scripts/trigger-circleci.sh [branch] [--param KEY=VALUE ...]
# Defaults to current branch if not specified
# Additional pipeline parameters can be passed after the branch
# Uses setup-manual.yml to bypass path-filtering and honor manual parameters

set -e

PROJECT_SLUG="circleci/EpKr3yPPwk6x8UkpiKhG9m/TdAVxSgrvkHaBdVN5J7mmB"
PIPELINE_ID="7d06d2ae-4156-4d13-a794-57b43cbfc777"

# Parse arguments
BRANCH="${1:-$(git branch --show-current)}"
shift 2>/dev/null || true

echo "Triggering CircleCI pipeline for branch: $BRANCH"
echo "Project: $PROJECT_SLUG"
echo "Pipeline ID: $PIPELINE_ID"
echo "Using manual setup config (bypasses path-filtering)"
echo ""

# Build the command with manual setup config
CMD="/home/linuxbrew/.linuxbrew/bin/circleci pipeline run --project $PROJECT_SLUG --definition-id $PIPELINE_ID --branch $BRANCH --config .circleci/setup-manual.yml"

# Add any additional parameters
for arg in "$@"; do
  if [[ "$arg" == --param=* ]]; then
    CMD="$CMD $arg"
  fi
done

CMD="$CMD --json"

# Run the command
eval "$CMD"

echo ""
echo "✅ Pipeline triggered. View at: https://app.circleci.com/pipelines/github/tan-yong-sheng/cloudflare-image-mcp"
