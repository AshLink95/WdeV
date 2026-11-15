const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const HOOK = path.join(__dirname, '..', 'hooks', 'wdev.js');

/** Runs the hook as Claude Code would and returns its additionalContext. */
function run(event, input, env = {}) {
  const out = execFileSync('node', [HOOK, event], {
    input: JSON.stringify(input),
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  const { hookSpecificOutput } = JSON.parse(out);
  assert.strictEqual(hookSpecificOutput.hookEventName, event === 'subagent' ? 'SubagentStart' : 'SessionStart');
  return hookSpecificOutput.additionalContext;
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wdev-'));

test('name resolution: env, then config, then git', () => {
  const xdg = tmp();
  fs.mkdirSync(path.join(xdg, 'wdev'));
  fs.writeFileSync(path.join(xdg, 'wdev', 'config.json'), '{"name":"FromConfig"}');
  const gitHome = tmp();
  fs.writeFileSync(path.join(gitHome, '.gitconfig'), '[user]\n\tname = FromGit\n');
  const base = { WDEV_NAME: '', HOME: gitHome, XDG_CONFIG_HOME: xdg, GIT_CONFIG_NOSYSTEM: '1' };

  assert.match(run('session', {}, { ...base, WDEV_NAME: 'FromEnv' }), /^User name: FromEnv\n/);
  assert.match(run('session', {}, base), /^User name: FromConfig\n/);
  assert.match(run('session', {}, { ...base, XDG_CONFIG_HOME: tmp() }), /^User name: FromGit\n/);
  assert.match(run('session', {}, { ...base, XDG_CONFIG_HOME: tmp(), HOME: tmp() }), /^User name: unknown/);
});

test('handoff is injected once on clear, then kept as handoff.last.md', () => {
  const cwd = tmp();
  fs.mkdirSync(path.join(cwd, '.wdev'));
  fs.writeFileSync(path.join(cwd, '.wdev', 'handoff.md'), 'NEXT: ship it');
  const env = { WDEV_NAME: 'X' };

  assert.doesNotMatch(run('session', { source: 'compact', cwd }, env), /ship it/);
  assert.match(run('session', { source: 'clear', cwd }, env), /HANDOFF FROM PREVIOUS SESSION[\s\S]*NEXT: ship it/);
  assert.doesNotMatch(run('session', { source: 'clear', cwd }, env), /ship it/);
  assert.strictEqual(fs.readFileSync(path.join(cwd, '.wdev', 'handoff.last.md'), 'utf8'), 'NEXT: ship it');
});

test('subagent gets the rules without the main-session-only sections', () => {
  const ctx = run('subagent', {});
  assert.doesNotMatch(ctx, /Canary|User name|Exactly!|## Plan first|stop and ask|## Subagents|judge/);
  assert.match(run('session', {}, { WDEV_NAME: 'X' }), /Exactly![\s\S]*## Plan first[\s\S]*## Subagents/);
  assert.match(ctx, /## Code/);
  assert.match(ctx, /## Docs/);
  assert.match(ctx, /## Git/);
});
