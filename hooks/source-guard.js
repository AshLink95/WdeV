#!/usr/bin/env node
// @ts-check
/**
 * wdev PreToolUse hook for WebFetch|WebSearch. Keeps discipline agents on
 * their trusted sources. Plugin agents can't carry their own frontmatter hooks,
 * so this lives at plugin level and keys on `agent_type`.
 *
 * WebFetch outside the allowlist is denied. WebSearch is pinned to it via
 * `allowed_domains`. Agents without an entry are untouched.
 */

/** @type {Record<string, string[]>} Trusted domains per agent; subdomains included. */
const SOURCES = {
  physicist: [
    'arxiv.org', 'aps.org', 'scipost.org', 'quantum-journal.org',
    'iopscience.iop.org', 'doaj.org', 'inspirehep.net', 'doi.org',
  ],
};

/**
 * Hook output for one PreToolUse payload, or null to let the call through untouched.
 * @param {{agent_type?: string, tool_name?: string, tool_input?: Record<string, any>}} input
 * @returns {object | null}
 */
function decide(input) {
  const agent = String(input.agent_type || '').split(':').pop() || '';
  const domains = Object.hasOwn(SOURCES, agent) ? SOURCES[agent] : null;
  if (!domains) return null;

  const toolInput = input.tool_input || {};
  if (input.tool_name === 'WebSearch') {
    return { hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      updatedInput: { ...toolInput, allowed_domains: domains },
    } };
  }

  let host = '';
  try { host = new URL(toolInput.url).hostname; } catch (e) {}
  if (host && domains.some((d) => host === d || host.endsWith('.' + d))) return null;
  return { hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: `${agent} may only fetch from: ${domains.join(', ')}`,
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
      // Unparseable input: agent unknown, so nothing to guard.
    }
  });
}

module.exports = { decide, SOURCES };
