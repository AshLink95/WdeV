#!/usr/bin/env node
// @ts-check
/**
 * wdev PreToolUse hook for shell tools (Bash, Monitor, PowerShell). A command that runs
 * state-changing git needs the user's approval, whoever runs it (main agent or subagent);
 * read-only git runs freely. Pairs with the Git rule in AGENTS.md: the agent only changes
 * git state when asked. A tripwire, not a sandbox: it catches plain spellings of git, not
 * deliberate obfuscation (`g\it`, `gi""t`, `${G}`); a regex can't close that.
 */

/** Subcommands that only inspect the repo. */
const READ_ONLY = new Set(['status', 'log', 'diff', 'show', 'blame', 'shortlog', 'ls-files', 'grep', 'rev-parse', 'describe']);

/**
 * Each `git` command word (bare, quoted, next to a shell operator, or a path like `/usr/bin/git`),
 * capturing its subcommand (group 3). Only `-C <path>` and `--no-pager` are skipped as global
 * options; any other option (e.g. `-c k=v`) is captured as the subcommand, so it asks.
 * A `git-<sub>` binary (e.g. `/usr/lib/git-core/git-commit`) captures `<sub>` in group 4.
 */
const GIT = /(^|[^\w.-])git(?:(\.exe)?["']?(?![\w./-])(?:\s+(?:-C\s+\S+|--no-pager))*(?:\s+([\w-]+))?|-([\w-]+)(?![\w./-]))/gm;

/** Hook output that sends the call to the user for approval. */
const ASK = { hookSpecificOutput: {
  hookEventName: 'PreToolUse',
  permissionDecision: 'ask',
  permissionDecisionReason: 'wdev: git that changes state runs only on your request, with your approval.',
} };

/**
 * Hook output for one PreToolUse payload, or null to let the call through untouched.
 * @param {{tool_input?: {command?: string}}} input
 * @returns {object | null}
 */
function decide(input) {
  const command = String(input.tool_input?.command || '');
  if ([...command.matchAll(GIT)].every((m) => READ_ONLY.has(m[3] || m[4]))) return null;
  return ASK;
}

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', (c) => { raw += c; });
  process.stdin.on('end', () => {
    try {
      const out = decide(JSON.parse(raw.replace(/^\uFEFF/, '')));
      if (out) process.stdout.write(JSON.stringify(out));
    } catch (e) {
      // Unparseable input: can't rule out git, so fail closed.
      process.stdout.write(JSON.stringify(ASK));
    }
  });
}

module.exports = { decide };
