#!/usr/bin/env node
// @ts-check
/**
 * wdev PreToolUse hook for Bash. Any command that runs git needs the user's
 * approval, whoever runs it (main agent or subagent). Pairs with the Git rule
 * in AGENTS.md: the agent only runs git when asked, and the user approves each call.
 */

/** `git` as a command word: bare, after a separator, or as a path like `/usr/bin/git`. */
const GIT = /(^|[^\w.-])git(\s|$)/m;

/**
 * Hook output for one PreToolUse payload, or null to let the call through untouched.
 * @param {{tool_input?: {command?: string}}} input
 * @returns {object | null}
 */
function decide(input) {
  if (!GIT.test(String(input.tool_input?.command || ''))) return null;
  return { hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'ask',
    permissionDecisionReason: 'wdev: git runs only on your request, with your approval.',
  } };
}

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', (c) => { raw += c; });
  process.stdin.on('end', () => {
    try {
      const out = decide(JSON.parse(raw.replace(/^﻿/, '')));
      if (out) process.stdout.write(JSON.stringify(out));
    } catch (e) {
      // Unparseable input: no command to inspect, defer to normal permissions.
    }
  });
}

module.exports = { decide };
