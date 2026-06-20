#!/usr/bin/env bash
# Convenience wrapper:
#   1. agentcore deploy
#   2. post_deploy.py to patch IAM gaps the agentcore CDK leaves behind
#
# Usage:
#   cd <project root containing serverlessstrands/>
#   ./scripts/deploy.sh           # full deploy
#   ./scripts/deploy.sh --skip-deploy   # just run IAM fixups
#
# Env:
#   AWS_PROFILE (required, default developer-dongik)
#   AWS_REGION  (default ap-northeast-2)

set -euo pipefail

AWS_PROFILE="${AWS_PROFILE:-developer-dongik}"
AWS_REGION="${AWS_REGION:-ap-northeast-2}"
export AWS_PROFILE AWS_REGION

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
AGENTCORE_DIR="$PROJECT_ROOT/serverlessstrands"

if [[ ! -d "$AGENTCORE_DIR/agentcore" ]]; then
    echo "ERROR: expected $AGENTCORE_DIR/agentcore directory" >&2
    exit 1
fi

cd "$AGENTCORE_DIR"

if [[ "${1:-}" != "--skip-deploy" ]]; then
    echo "→ agentcore deploy"
    agentcore deploy -y
else
    echo "→ skipping agentcore deploy (running IAM fixups only)"
fi

echo
echo "→ Post-deploy IAM fixups"
"$SCRIPT_DIR/post_deploy.py"
