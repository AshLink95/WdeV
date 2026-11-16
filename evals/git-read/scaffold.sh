#!/usr/bin/env bash
# Repo with four commits; the newest is "delta fixture".
set -euo pipefail
git init -q -b main
for s in alpha beta gamma delta; do git commit -q --allow-empty -m "$s fixture"; done
