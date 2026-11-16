#!/usr/bin/env bash
# Stages hooks/wdev.js in the run's cwd and sets the canary name via wdev's config.json.
# WDEV_NAME can't be used: case env only passes EVAL_* keys.
# HOME is the run's throwaway sandbox home, so the write can't touch the user's real config.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
config="${XDG_CONFIG_HOME:-$HOME/.config}/wdev"
mkdir -p hooks "$config"
cp "$root/hooks/wdev.js" hooks/
printf '{"name":"Ash"}\n' > "$config/config.json"
