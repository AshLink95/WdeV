#!/usr/bin/env bash
# Repo with one commit, a modified tracked file and an untracked file.
set -euo pipefail
git init -q -b main
echo one > notes.txt
git add notes.txt
git commit -q -m init
echo two >> notes.txt
echo new > todo.txt
