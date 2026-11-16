#!/usr/bin/env node
// @ts-check
/**
 * wdev hook. Usage: `node wdev.js session|subagent|plan`, hook JSON on stdin.
 *
 * session:  injects AGENTS.md with the user's name for the canary, plus a
 *           pending `.wdev/handoff.md` on startup/clear (consumed once).
 * subagent: injects AGENTS.md minus the main-session-only sections (canary,
 *           plans and stops, spawning subagents); SessionStart context never
 *           reaches subagents.
 * plan:     after ExitPlanMode, tells the agent to create the task list, then stop.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const RULES_PATH = path.join(__dirname, '..', 'AGENTS.md');

/** AGENTS.md sections a subagent can't follow: it has no user to talk to and must not fan out. */
const MAIN_ONLY = /^## (Response|Plan first|Subagents)\r?\n[\s\S]*?(?=^## |(?![\s\S]))/gm;

/** Claude Code hookEventName per CLI event. */
const HOOK_EVENTS = { session: 'SessionStart', subagent: 'SubagentStart', plan: 'PostToolUse' };

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
 * @param {string} event `session`, `subagent` or `plan`
 * @param {{source?: string, cwd?: string}} input
 * @returns {string}
 */
function buildContext(event, input) {
  if (event === 'plan') return 'Plan approved. Before any other work: create the plan\'s task list with `TaskCreate` (one item per reviewable commit) and show it. Then stop and wait for the user to say go.';
  const rules = fs.readFileSync(RULES_PATH, 'utf8');
  if (event === 'subagent') return rules.replace(MAIN_ONLY, '');

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
      try { input = JSON.parse(raw.replace(/^\uFEFF/, '')); } catch (e) {}
      const hookEventName = HOOK_EVENTS[event];
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: { hookEventName, additionalContext: buildContext(event, input) },
      }));
    } catch (e) {
      // Silent fail: a broken hook must never block the session.
    }
  });
}

module.exports = { HOOK_EVENTS, buildContext, resolveName, takeHandoff };
