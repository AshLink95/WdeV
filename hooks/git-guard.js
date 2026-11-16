#!/usr/bin/env node
// @ts-check
/**
 * wdev git guard. As a PreToolUse hook for shell tools (Bash, Monitor, PowerShell), it asks the
 * user before git that commits, resets, adds, pushes, pulls, stashes or changes branches, whoever
 * runs it (main agent or subagent); all other git runs freely. As a UserPromptSubmit hook
 * (`prompt` argument), it records the git subcommands the user's message spells out (`git push`):
 * until the next message, those run without asking. Pairs with the Git rule in AGENTS.md.
 * A tripwire, not a sandbox: it catches plain spellings of git, not deliberate obfuscation
 * (`g\it`, `gi""t`, `${G}`); a regex can't close that.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

/** Subcommands that always ask. `stash` and `branch` ask unless they only list (see `changesState`). */
const GUARDED = new Set(['commit', 'reset', 'add', 'push', 'pull', 'checkout', 'switch', 'merge', 'rebase']);

/** `git branch` flags that create, delete, rename, copy or re-point a branch. */
const BRANCH_WRITE = /\s(?:-[a-z]*[dDmMcCfu]\b|--(?:delete|move|copy|force|set-upstream-to|unset-upstream|edit-description|track|no-track|create-reflog)\b)/;

/** `git branch` flags whose positional argument is a pattern or commit to list by, not a new branch. */
const BRANCH_LIST = /\s(?:-[a-z]*l\b|--(?:list|contains|no-contains|merged|no-merged|points-at|sort|format)\b)/;

/**
 * Each `git` command word (bare, quoted, next to a shell operator, or a path like `/usr/bin/git`),
 * skipping global options: group 2 is its subcommand. A `git-<sub>` binary
 * (e.g. `/usr/lib/git-core/git-commit`) gives `<sub>` in group 3. Group 4 is the arguments, up to
 * the next shell operator.
 */
const GIT = /(^|[^\w.-])git(?:(?:\.exe)?["']?(?![\w./-])(?:\s+(?:-[Cc]\s+\S+|--(?:git-dir|work-tree|namespace)\s+\S+|-{1,2}[\w-]+(?:=\S*)?))*(?:\s+([\w-]+))?|-([\w-]+)(?![\w./-]))([^;&|\n)`]*)/gm;

/** Where the last message's git subcommands are kept: one file, naming the session it belongs to. */
const ASKED = path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'), 'wdev', 'git-asked.json');

/** Hook output that sends the call to the user for approval. */
const ASK = { hookSpecificOutput: {
  hookEventName: 'PreToolUse',
  permissionDecision: 'ask',
  permissionDecisionReason: 'wdev: commits, resets, adds, pushes, pulls, stashes and branch changes need your approval unless your message spelled out the git command.',
} };

/**
 * Each git invocation in a text: its subcommand and its arguments.
 * @param {string} text
 * @returns {{sub: string | undefined, args: string}[]}
 */
const invocations = (text) => [...text.matchAll(GIT)].map((m) => ({ sub: m[2] || m[3], args: m[4] }));

/**
 * Whether one git invocation changes state as the guard counts it.
 * @param {{sub: string | undefined, args: string}} git
 */
function changesState({ sub, args }) {
  if (sub === 'stash') return !/^\s+(?:list|show)\b/.test(args);
  if (sub === 'branch') return BRANCH_WRITE.test(args) || (/\s[^-\s]/.test(args) && !BRANCH_LIST.test(args));
  return GUARDED.has(sub || '');
}

/**
 * Hook output for one PreToolUse payload, or null to let the call through untouched.
 * @param {{tool_input?: {command?: string}}} input
 * @param {string[]} asked subcommands the user's last message spelled out
 * @returns {object | null}
 */
function decide(input, asked = []) {
  const command = String(input.tool_input?.command || '');
  return invocations(command).some((git) => changesState(git) && !asked.includes(git.sub || '')) ? ASK : null;
}

/**
 * Records the git subcommands a UserPromptSubmit payload's prompt spells out, replacing the last message's.
 * @param {{session_id?: string, prompt?: string}} input
 */
function record(input) {
  const asked = invocations(String(input.prompt || '')).map((git) => git.sub).filter(Boolean);
  fs.mkdirSync(path.dirname(ASKED), { recursive: true });
  fs.writeFileSync(ASKED, JSON.stringify({ session: input.session_id, asked }));
}

/**
 * The subcommands the session's last message spelled out; none without a record for that session.
 * @param {string | undefined} session
 * @returns {string[]}
 */
function askedFor(session) {
  try {
    const saved = JSON.parse(fs.readFileSync(ASKED, 'utf8'));
    return session && saved.session === session ? saved.asked : [];
  } catch {
    return [];
  }
}

if (require.main === module) {
  const mode = process.argv[2];
  let raw = '';
  process.stdin.on('data', (c) => { raw += c; });
  process.stdin.on('end', () => {
    try {
      const input = JSON.parse(raw.replace(/^﻿/, ''));
      if (mode === 'prompt') return record(input);
      const out = decide(input, askedFor(input.session_id));
      if (out) process.stdout.write(JSON.stringify(out));
    } catch (e) {
      // Unparseable tool input can't rule out git, so fail closed; a prompt not recorded grants nothing.
      if (mode !== 'prompt') process.stdout.write(JSON.stringify(ASK));
    }
  });
}

module.exports = { decide };
