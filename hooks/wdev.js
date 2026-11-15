#!/usr/bin/env node
// @ts-check
/**
 * wdev hook. Usage: `node wdev.js session|subagent`, hook JSON on stdin.
 *
 * session:  injects AGENTS.md with the user's name for the canary, plus a
 *           pending `.wdev/handoff.md` on startup/clear (consumed once).
 * subagent: injects AGENTS.md without the canary; SessionStart context never
 *           reaches subagents.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const RULES_PATH = path.join(__dirname, '..', 'AGENTS.md');

/**
 * User name for the canary: WDEV_NAME, then wdev config.json `name`, then git user.name.
 * @returns {string | null} null if none is set
 */
function resolveName() {
  if (process.env.WDEV_NAME) return process.env.WDEV_NAME.trim();
  const configDir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  try {
    const { name } = JSON.parse(fs.readFileSync(path.join(configDir, 'wdev', 'config.json'), 'utf8'));
    if (name) return String(name).trim();
  } catch (e) {}
  try {
    return execFileSync('git', ['config', 'user.name'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch (e) {
    return null;
  }
}

/**
 * Returns the pending handoff text and renames it to handoff.last.md.
 * @param {string} cwd project root
 * @returns {string | null} null if no handoff is pending
 */
function takeHandoff(cwd) {
  const file = path.join(cwd, '.wdev', 'handoff.md');
  try {
    const text = fs.readFileSync(file, 'utf8');
    fs.renameSync(file, path.join(cwd, '.wdev', 'handoff.last.md'));
    return text;
  } catch (e) {
    return null;
  }
}

/**
 * Builds the additionalContext string for a hook event from its stdin payload.
 * @param {string} event `session` or `subagent`
 * @param {{source?: string, cwd?: string}} input
 * @returns {string}
 */
function buildContext(event, input) {
  const rules = fs.readFileSync(RULES_PATH, 'utf8');
  if (event === 'subagent') return rules.replace(/^## Response\n[\s\S]*?(?=^## )/m, '');

  const name = resolveName();
  let out = (name
    ? `User name: ${name}`
    : 'User name: unknown. Ask for it once, then suggest setting WDEV_NAME.') + '\n\n' + rules;
  if (input.source === 'startup' || input.source === 'clear') {
    const handoff = takeHandoff(input.cwd || process.cwd());
    if (handoff) out += '\n\n# HANDOFF FROM PREVIOUS SESSION\n\nContinue from here.\n\n' + handoff;
  }
  return out;
}

if (require.main === module) {
  const event = process.argv[2];
  let raw = '';
  process.stdin.on('data', (c) => { raw += c; });
  process.stdin.on('end', () => {
    try {
      let input = {};
      try { input = JSON.parse(raw.replace(/^﻿/, '')); } catch (e) {}
      const hookEventName = event === 'subagent' ? 'SubagentStart' : 'SessionStart';
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: { hookEventName, additionalContext: buildContext(event, input) },
      }));
    } catch (e) {
      // Silent fail: a broken hook must never block the session.
    }
  });
}

module.exports = { buildContext, resolveName, takeHandoff };
