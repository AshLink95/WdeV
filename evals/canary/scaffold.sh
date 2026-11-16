#!/usr/bin/env bash
# Stages hooks/wdev.js in the run's cwd and sets the canary name via wdev's config.json.
# WDEV_NAME can't be used: case env only passes EVAL_* keys.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir -p hooks "$HOME/.config/wdev"
cp "$root/hooks/wdev.js" hooks/
printf '{"name":"Ash"}\n' > "$HOME/.config/wdev/config.json"
