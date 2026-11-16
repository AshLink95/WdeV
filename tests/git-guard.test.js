const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { decide } = require('../hooks/git-guard');

const asks = (command) => decide({ tool_name: 'Bash', tool_input: { command } })?.hookSpecificOutput.permissionDecision === 'ask';

test('read-only git runs freely', () => {
  assert.strictEqual(decide({ tool_input: { command: 'git status' } }), null);
  assert.strictEqual(decide({ tool_input: { command: 'git -C x log' } }), null);
  assert.strictEqual(decide({ tool_input: { command: 'git --no-pager diff' } }), null);
  assert.strictEqual(decide({ tool_input: { command: '"git" log' } }), null);
  assert.strictEqual(decide({ tool_input: { command: 'git log | head' } }), null);
  assert.strictEqual(decide({ tool_input: { command: 'git diff && git status' } }), null);
  assert.strictEqual(decide({ tool_input: { command: 'cd repo && git log --oneline' } }), null);
  assert.strictEqual(decide({ tool_input: { command: 'git-log -1' } }), null);
  assert.strictEqual(decide({ tool_input: { command: '/usr/lib/git-core/git-status' } }), null);
});

test('state-changing or unrecognised git needs approval', () => {
  assert.ok(asks('git commit -m x'));
  assert.ok(asks('git push'));
  assert.ok(asks('git add .'));
  assert.ok(asks('ls; git reset --hard'));
  assert.ok(asks('git log && git push'));
  assert.ok(asks('git -c core.pager=x log'));
  assert.ok(asks('git'));
  assert.ok(asks('/usr/bin/git checkout x'));
  assert.ok(asks('sh -c "git stash"'));
  assert.ok(asks('git.exe push'));
  assert.ok(asks("'git' push"));
  assert.ok(asks('git;ls'));
  assert.ok(asks('$(git rev-parse HEAD) && git tag v1'));
  assert.ok(asks('git-commit -m x'));
  assert.ok(asks('/usr/lib/git-core/git-commit'));
  assert.ok(asks('git status;git-commit'));
  assert.ok(asks('git-reset --hard'));
});

test('non-git commands are untouched', () => {
  assert.strictEqual(decide({ tool_input: { command: 'cat .gitignore' } }), null);
  assert.strictEqual(decide({ tool_input: { command: 'ls .git/' } }), null);
  assert.strictEqual(decide({ tool_input: { command: 'npm run digit' } }), null);
  assert.strictEqual(decide({ tool_input: { command: 'npm i simple-git' } }), null);
  assert.strictEqual(decide({ tool_input: { command: 'cat ~/.config/git/config' } }), null);
  assert.strictEqual(decide({ tool_input: { command: 'cat git.txt' } }), null);
  assert.strictEqual(decide({ tool_input: {} }), null);
});

test('malformed hook input fails closed', () => {
  const run = spawnSync(process.execPath, [path.join(__dirname, '../hooks/git-guard.js')], { input: '{not json' });
  assert.strictEqual(JSON.parse(run.stdout.toString()).hookSpecificOutput.permissionDecision, 'ask');
});
