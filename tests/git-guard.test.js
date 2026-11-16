const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { decide } = require('../hooks/git-guard');

const HOOK = path.join(__dirname, '../hooks/git-guard.js');
const asks = (command, asked) => decide({ tool_name: 'Bash', tool_input: { command } }, asked)?.hookSpecificOutput.permissionDecision === 'ask';

test('reading, diffing and other git runs freely', () => {
  for (const command of [
    'git status', 'git -C x log', 'git --no-pager diff', '"git" log', 'git log | head',
    'git diff && git status', 'cd repo && git log --oneline', 'git-log -1', '/usr/lib/git-core/git-status',
    'git -c core.pager=x log', 'git', 'git;ls', 'git fetch', 'git tag v1', 'git log --grep=commit',
    'git branch', 'git branch -a', 'git branch -vv', 'git branch --show-current', "git branch --list 'feat*'",
    'git branch --contains HEAD', 'git rev-parse --abbrev-ref HEAD', 'git stash list', 'git stash show -p',
  ]) assert.ok(!asks(command), command);
});

test('commits, resets, adds, pushes, pulls, stashes and branch changes need approval', () => {
  for (const command of [
    'git commit -m x', 'git push', 'git add .', 'ls; git reset --hard', 'git log && git push', 'git pull',
    'git stash', 'git stash pop', 'git branch foo', 'git branch -D foo', 'git branch -m a b',
    'git checkout main', 'git switch -c x', 'git merge x', 'git rebase main', '/usr/bin/git checkout x',
    'sh -c "git stash"', 'git.exe push', "'git' push", 'git -C x commit -m y', 'git -c a=b push',
    'git --git-dir .git add x', 'git-commit -m x', '/usr/lib/git-core/git-commit', 'git status;git-commit', 'git-reset --hard',
  ]) assert.ok(asks(command), command);
});

test('non-git commands are untouched', () => {
  for (const command of ['cat .gitignore', 'ls .git/', 'npm run digit', 'npm i simple-git', 'cat ~/.config/git/config', 'cat git.txt']) {
    assert.ok(!asks(command), command);
  }
  assert.strictEqual(decide({ tool_input: {} }), null);
});

test('a subcommand the user spelled out runs without asking; others still ask', () => {
  assert.ok(!asks('git commit -m x && git push', ['commit', 'push']));
  assert.ok(asks('git commit -m x && git push', ['commit']));
});

test('a prompt naming git grants it to its own session until the next prompt', () => {
  const env = { ...process.env, XDG_STATE_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'wdev-')) };
  const run = (args, input) => spawnSync(process.execPath, [HOOK, ...args], { input: JSON.stringify(input), env }).stdout.toString();
  const push = (session_id) => run([], { session_id, tool_name: 'Bash', tool_input: { command: 'git push' } });

  assert.strictEqual(run(['prompt'], { session_id: 's1', prompt: 'please git push now' }), '');
  assert.strictEqual(push('s1'), '');
  assert.match(push('s2'), /"ask"/);
  run(['prompt'], { session_id: 's1', prompt: 'push it' });
  assert.match(push('s1'), /"ask"/);
});

test('malformed hook input fails closed', () => {
  const run = spawnSync(process.execPath, [HOOK], { input: '{not json' });
  assert.strictEqual(JSON.parse(run.stdout.toString()).hookSpecificOutput.permissionDecision, 'ask');
});
