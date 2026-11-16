#!/usr/bin/env bash
# Stages hooks/git-guard.js in the run's cwd.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir -p hooks
cp "$root/hooks/git-guard.js" hooks/
